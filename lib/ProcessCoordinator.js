const EventEmitter = require('events');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const net = require('net');
const { ErrorHandler, ErrorCodes } = require('./ErrorHandler');

class ProcessCoordinator extends EventEmitter {
  constructor(binaryManager) {
    super();
    this.binaryManager = binaryManager;
    this.goProcess = null;
    this.webServerPort = null;
    this.configFile = null;
    this.isShuttingDown = false;
    this.messageQueue = [];
    this.processReady = false;
    this.errorHandler = new ErrorHandler();
    this.processStartTime = null;
    this.lastHeartbeat = null;
    this.heartbeatInterval = null;
    this.setupErrorHandling();
  }

  setupErrorHandling() {
    this.errorHandler.on('error', (error) => {
      console.error(`Process Coordinator Error [${error.code}]: ${error.getUserMessage()}`);
      this.emit('process_error', error);
    });

    this.errorHandler.on('retry', ({ error, attempt, maxRetries }) => {
      console.warn(`Retrying process operation (${attempt}/${maxRetries}): ${error.getUserMessage()}`);
    });

    this.errorHandler.on('max_retries_exceeded', ({ error, attempts }) => {
      console.error(`Max retries exceeded for ${error.code} after ${attempts} attempts`);
      this.emit('process_error', error);
    });
  }

  async findAvailablePort(startPort = 3000, maxAttempts = 100) {
    let attempts = 0;
    
    while (attempts < maxAttempts) {
      try {
        const port = await this._tryPort(startPort + attempts);
        return port;
      } catch (error) {
        attempts++;
        if (attempts >= maxAttempts) {
          throw this.errorHandler.createNetworkError(
            ErrorCodes.PORT_UNAVAILABLE,
            `Could not find available port after ${maxAttempts} attempts (starting from ${startPort})`,
            error,
            { startPort, maxAttempts, lastAttempt: startPort + attempts - 1 }
          );
        }
      }
    }
  }

  async _tryPort(port) {
    return new Promise((resolve, reject) => {
      const server = net.createServer();
      
      const timeout = setTimeout(() => {
        server.close();
        reject(new Error('Port check timeout'));
      }, 1000);
      
      server.listen(port, () => {
        clearTimeout(timeout);
        const actualPort = server.address().port;
        server.close(() => resolve(actualPort));
      });
      
      server.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  }

  async createConfigFile(config) {
    try {
      // Validate configuration
      this.validateConfig(config);
      
      const tempDir = require('os').tmpdir();
      this.configFile = path.join(tempDir, `http-load-test-config-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.json`);
      
      const goConfig = {
        url: config.url,
        method: config.method || 'GET',
        headers: config.headers || {},
        body: config.data ? JSON.stringify(config.data) : '',
        totalRequests: config.totalRequests || 10,
        requestsPerSecond: config.requestsPerSecond || 10,
        concurrentRequests: config.concurrentRequests || 1,
        timeout: config.timeout || 30000,
        successChecker: config.successChecker ? config.successChecker.toString() : null,
        dynamicDataFunc: config.dynamicDataFunc ? config.dynamicDataFunc.toString() : null,
        webServerPort: this.webServerPort
      };

      fs.writeFileSync(this.configFile, JSON.stringify(goConfig, null, 2));
      console.log(`Created configuration file: ${this.configFile}`);
      return this.configFile;
    } catch (error) {
      if (error.code) {
        throw error; // Already a LoadTestError
      }
      
      throw this.errorHandler.createConfigError(
        ErrorCodes.INVALID_CONFIG,
        `Failed to create configuration file: ${error.message}`,
        error,
        { config }
      );
    }
  }

  validateConfig(config) {
    if (!config || typeof config !== 'object') {
      throw this.errorHandler.createConfigError(
        ErrorCodes.INVALID_CONFIG,
        'Configuration must be a valid object',
        null,
        { providedType: typeof config }
      );
    }

    // Validate URL
    if (!config.url) {
      throw this.errorHandler.createValidationError(
        ErrorCodes.MISSING_REQUIRED_PARAM,
        'URL is required',
        null,
        { field: 'url' }
      );
    }

    try {
      new URL(config.url);
    } catch (urlError) {
      throw this.errorHandler.createValidationError(
        ErrorCodes.INVALID_URL,
        `Invalid URL format: ${config.url}`,
        urlError,
        { url: config.url }
      );
    }

    // Validate numeric parameters
    const numericParams = [
      { key: 'totalRequests', min: 1, max: 1000000 },
      { key: 'requestsPerSecond', min: 1, max: 10000 },
      { key: 'concurrentRequests', min: 1, max: 1000 },
      { key: 'timeout', min: 1000, max: 300000 }
    ];

    numericParams.forEach(({ key, min, max }) => {
      if (config[key] !== undefined) {
        const value = Number(config[key]);
        if (isNaN(value) || value < min || value > max) {
          throw this.errorHandler.createValidationError(
            ErrorCodes.INVALID_CONFIG,
            `${key} must be a number between ${min} and ${max}`,
            null,
            { field: key, value: config[key], min, max }
          );
        }
      }
    });

    // Validate functions
    if (config.successChecker && typeof config.successChecker !== 'function') {
      throw this.errorHandler.createValidationError(
        ErrorCodes.INVALID_FUNCTION,
        'successChecker must be a function',
        null,
        { field: 'successChecker', type: typeof config.successChecker }
      );
    }

    if (config.dynamicDataFunc && typeof config.dynamicDataFunc !== 'function') {
      throw this.errorHandler.createValidationError(
        ErrorCodes.INVALID_FUNCTION,
        'dynamicDataFunc must be a function',
        null,
        { field: 'dynamicDataFunc', type: typeof config.dynamicDataFunc }
      );
    }
  }

  async startGoProcess(config) {
    try {
      console.log('Starting Go process...');
      this.processStartTime = Date.now();

      // Ensure binary is available
      const success = await this.binaryManager.ensureBinary();
      if (!success) {
        throw this.errorHandler.createProcessError(
          ErrorCodes.BINARY_NOT_FOUND,
          'Failed to ensure Go binary is available',
          null,
          { binaryPath: this.binaryManager.getBinaryPath() }
        );
      }

      // Check binary health
      const healthCheck = this.binaryManager.isBinaryHealthy();
      if (!healthCheck.healthy) {
        throw this.errorHandler.createProcessError(
          ErrorCodes.BINARY_NOT_FOUND,
          `Binary health check failed: ${healthCheck.reason}`,
          null,
          { binaryPath: this.binaryManager.getBinaryPath() }
        );
      }

      // Find available port for web server
      this.webServerPort = await this.findAvailablePort();
      console.log(`Using port ${this.webServerPort} for web server`);
      
      // Create configuration file
      const configFile = await this.createConfigFile(config);

      // Start Go process
      const binaryPath = this.binaryManager.getBinaryPath();
      const args = [
        '--config', configFile,
        '--port', this.webServerPort.toString(),
        '--mode', 'api'
      ];

      console.log(`Spawning process: ${binaryPath} ${args.join(' ')}`);

      this.goProcess = spawn(binaryPath, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { 
          ...process.env, 
          NODE_ENV: 'production',
          HTTP_LOAD_TEST_MODE: 'api'
        }
      });

      this.setupProcessHandlers();
      this.startHeartbeat();
      
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          if (!this.processReady) {
            const error = this.errorHandler.createProcessError(
              ErrorCodes.PROCESS_TIMEOUT,
              'Timeout waiting for Go process to start (20 seconds)',
              null,
              { 
                timeout: 20000,
                processStartTime: this.processStartTime,
                port: this.webServerPort
              }
            );
            reject(error);
          }
        }, 20000);

        this.once('process_ready', () => {
          clearTimeout(timeout);
          console.log('Go process is ready');
          resolve();
        });

        this.once('process_error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });
    } catch (error) {
      if (error.code) {
        throw error; // Already a LoadTestError
      }
      
      throw this.errorHandler.createProcessError(
        ErrorCodes.PROCESS_START_FAILED,
        `Failed to start Go process: ${error.message}`,
        error,
        { config }
      );
    }
  }

  setupProcessHandlers() {
    let stdoutBuffer = '';
    let stderrBuffer = '';

    this.goProcess.stdout.on('data', (data) => {
      this.lastHeartbeat = Date.now();
      stdoutBuffer += data.toString();
      this.processStdoutBuffer(stdoutBuffer);
    });

    this.goProcess.stderr.on('data', (data) => {
      stderrBuffer += data.toString();
      this.processStderrBuffer(stderrBuffer);
    });

    this.goProcess.on('error', (error) => {
      const processError = this.errorHandler.createProcessError(
        ErrorCodes.PROCESS_START_FAILED,
        `Go process error: ${error.message}`,
        error,
        { 
          pid: this.goProcess.pid,
          uptime: this.getProcessUptime()
        }
      );
      this.emit('process_error', processError);
    });

    this.goProcess.on('exit', (code, signal) => {
      this.stopHeartbeat();
      
      if (!this.isShuttingDown && code !== 0) {
        const processError = this.errorHandler.createProcessError(
          ErrorCodes.PROCESS_UNEXPECTED_EXIT,
          `Go process exited unexpectedly with code ${code} (signal: ${signal})`,
          null,
          { 
            exitCode: code,
            signal,
            uptime: this.getProcessUptime(),
            pid: this.goProcess.pid
          }
        );
        this.emit('process_error', processError);
      } else if (this.isShuttingDown) {
        console.log(`Go process exited gracefully (code: ${code}, signal: ${signal})`);
      }
      
      this.emit('process_exit', { code, signal });
    });

    this.goProcess.on('close', (code, signal) => {
      console.log(`Go process closed (code: ${code}, signal: ${signal})`);
    });

    // Handle process cleanup on Node.js exit
    const cleanup = () => this.cleanup();
    process.on('exit', cleanup);
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    process.on('uncaughtException', cleanup);
    process.on('unhandledRejection', cleanup);
  }

  startHeartbeat() {
    this.lastHeartbeat = Date.now();
    this.heartbeatInterval = setInterval(() => {
      const now = Date.now();
      const timeSinceLastHeartbeat = now - this.lastHeartbeat;
      
      // If no heartbeat for 30 seconds, consider process unresponsive
      if (timeSinceLastHeartbeat > 30000 && this.processReady) {
        console.warn(`No heartbeat from Go process for ${timeSinceLastHeartbeat}ms`);
        
        const error = this.errorHandler.createProcessError(
          ErrorCodes.PROCESS_COMMUNICATION_FAILED,
          'Go process appears unresponsive (no heartbeat)',
          null,
          { 
            timeSinceLastHeartbeat,
            pid: this.goProcess?.pid,
            uptime: this.getProcessUptime()
          }
        );
        
        this.emit('process_error', error);
      }
    }, 10000); // Check every 10 seconds
  }

  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  getProcessUptime() {
    return this.processStartTime ? Date.now() - this.processStartTime : 0;
  }

  processStdoutBuffer(buffer) {
    const lines = buffer.split('\n');
    
    for (let i = 0; i < lines.length - 1; i++) {
      const line = lines[i].trim();
      if (line) {
        this.processOutputLine(line);
      }
    }
  }

  processStderrBuffer(buffer) {
    const lines = buffer.split('\n');
    
    for (let i = 0; i < lines.length - 1; i++) {
      const line = lines[i].trim();
      if (line) {
        console.warn('Go process stderr:', line);
        this.emit('process_stderr', line);
      }
    }
  }

  processOutputLine(line) {
    // Try to parse as JSON message
    try {
      if (line.startsWith('{') && line.endsWith('}')) {
        const message = JSON.parse(line);
        this.handleStructuredMessage(message);
        return;
      }
    } catch (error) {
      // Not JSON, treat as plain text
    }

    // Handle plain text messages
    if (line.includes('Server started') || 
        line.includes('server listening') || 
        line.includes('HTTP server started') ||
        line.includes(`port ${this.webServerPort}`)) {
      if (!this.processReady) {
        this.processReady = true;
        setTimeout(() => this.emit('process_ready'), 500);
      }
    }

    this.emit('process_output', line);
  }

  handleStructuredMessage(message) {
    switch (message.type) {
      case 'server_ready':
        if (!this.processReady) {
          this.processReady = true;
          this.emit('process_ready');
        }
        break;
      case 'test_progress':
        this.emit('test_progress', message.data);
        break;
      case 'test_complete':
        this.emit('test_complete', message.data);
        break;
      case 'error':
        this.emit('process_error', new Error(message.message));
        break;
      default:
        this.emit('unknown_message', message);
    }
  }

  sendMessage(message) {
    if (!this.goProcess || this.goProcess.killed) {
      this.messageQueue.push(message);
      return false;
    }

    try {
      this.goProcess.stdin.write(JSON.stringify(message) + '\n');
      return true;
    } catch (error) {
      console.warn('Failed to send message to Go process:', error.message);
      return false;
    }
  }

  flushMessageQueue() {
    while (this.messageQueue.length > 0 && this.processReady) {
      const message = this.messageQueue.shift();
      if (!this.sendMessage(message)) {
        // Put message back if send failed
        this.messageQueue.unshift(message);
        break;
      }
    }
  }

  async makeHttpRequest(endpoint, options = {}, retryKey = null) {
    if (!this.webServerPort) {
      throw this.errorHandler.createNetworkError(
        ErrorCodes.PORT_UNAVAILABLE,
        'Web server port not available',
        null,
        { endpoint }
      );
    }

    const maxRetries = 3;
    let lastError = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this._makeHttpRequestAttempt(endpoint, options);
      } catch (error) {
        lastError = error;
        
        const categorizedError = this.errorHandler.categorizeError(error, {
          operation: 'http_request',
          endpoint,
          port: this.webServerPort,
          attempt
        });

        if (attempt < maxRetries && categorizedError.recoverable) {
          console.warn(`HTTP request attempt ${attempt} failed, retrying...`);
          await this._delay(1000 * attempt); // Exponential backoff
          continue;
        }
        
        throw this.errorHandler.createNetworkError(
          ErrorCodes.PROCESS_COMMUNICATION_FAILED,
          `HTTP request to ${endpoint} failed after ${maxRetries} attempts: ${error.message}`,
          error,
          { endpoint, port: this.webServerPort, attempts: maxRetries }
        );
      }
    }
  }

  async _makeHttpRequestAttempt(endpoint, options = {}) {
    const http = require('http');
    
    return new Promise((resolve, reject) => {
      const requestOptions = {
        hostname: 'localhost',
        port: this.webServerPort,
        path: endpoint,
        method: options.method || 'GET',
        headers: {
          'User-Agent': 'http-load-test-nodejs-wrapper',
          ...options.headers
        }
      };

      const timeout = setTimeout(() => {
        req.destroy();
        reject(new Error(`HTTP request timeout after 30 seconds`));
      }, 30000);

      const req = http.request(requestOptions, (res) => {
        clearTimeout(timeout);
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            const result = res.headers['content-type']?.includes('application/json') 
              ? JSON.parse(data) 
              : data;
            
            if (res.statusCode >= 400) {
              reject(new Error(`HTTP ${res.statusCode}: ${result.error || result.message || data}`));
              return;
            }
            
            resolve({ statusCode: res.statusCode, data: result });
          } catch (parseError) {
            // If JSON parsing fails, return raw data
            resolve({ statusCode: res.statusCode, data: data });
          }
        });

        res.on('error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });

      req.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });

      if (options.body) {
        req.write(options.body);
      }

      req.end();
    });
  }

  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async getStatus() {
    try {
      const response = await this.makeHttpRequest('/api/status', {}, 'get-status');
      return response.data;
    } catch (error) {
      if (error.code) {
        throw error; // Already a LoadTestError
      }
      
      throw this.errorHandler.createNetworkError(
        ErrorCodes.PROCESS_COMMUNICATION_FAILED,
        `Failed to get status: ${error.message}`,
        error,
        { endpoint: '/api/status' }
      );
    }
  }

  async getResults() {
    try {
      const response = await this.makeHttpRequest('/api/results', {}, 'get-results');
      return response.data;
    } catch (error) {
      if (error.code) {
        throw error; // Already a LoadTestError
      }
      
      throw this.errorHandler.createNetworkError(
        ErrorCodes.PROCESS_COMMUNICATION_FAILED,
        `Failed to get results: ${error.message}`,
        error,
        { endpoint: '/api/results' }
      );
    }
  }

  async startTest() {
    return this.sendMessage({ type: 'start_test' });
  }

  async stopTest() {
    return this.sendMessage({ type: 'stop_test' });
  }

  getWebServerUrl() {
    return this.webServerPort ? `http://localhost:${this.webServerPort}` : null;
  }

  isProcessRunning() {
    return this.goProcess && !this.goProcess.killed && this.processReady;
  }

  /**
   * Get process health information
   */
  getProcessHealth() {
    if (!this.goProcess) {
      return { healthy: false, reason: 'Process not started' };
    }

    if (this.goProcess.killed) {
      return { healthy: false, reason: 'Process was killed' };
    }

    if (!this.processReady) {
      return { healthy: false, reason: 'Process not ready' };
    }

    const uptime = this.getProcessUptime();
    const timeSinceHeartbeat = this.lastHeartbeat ? Date.now() - this.lastHeartbeat : null;

    return {
      healthy: true,
      pid: this.goProcess.pid,
      uptime,
      port: this.webServerPort,
      timeSinceHeartbeat,
      isResponsive: !timeSinceHeartbeat || timeSinceHeartbeat < 30000
    };
  }

  /**
   * Get error statistics
   */
  getErrorStats() {
    return this.errorHandler.getErrorStats();
  }

  /**
   * Clear error history
   */
  clearErrors() {
    this.errorHandler.clearHistory();
  }

  /**
   * Get process diagnostics
   */
  getDiagnostics() {
    return {
      processHealth: this.getProcessHealth(),
      errorStats: this.getErrorStats(),
      configuration: {
        webServerPort: this.webServerPort,
        configFile: this.configFile,
        isShuttingDown: this.isShuttingDown
      },
      binaryInfo: {
        path: this.binaryManager.getBinaryPath(),
        exists: this.binaryManager.binaryExists(),
        version: this.binaryManager.getBinaryVersion(),
        health: this.binaryManager.isBinaryHealthy()
      }
    };
  }

  async cleanup() {
    if (this.isShuttingDown) {
      return; // Already cleaning up
    }
    
    console.log('Starting cleanup process...');
    this.isShuttingDown = true;
    this.stopHeartbeat();

    // Stop the Go process gracefully
    if (this.goProcess && !this.goProcess.killed) {
      console.log('Sending shutdown signal to Go process...');
      
      try {
        // Try graceful shutdown first
        this.sendMessage({ type: 'shutdown' });
        
        // Wait for graceful shutdown
        await new Promise((resolve) => {
          const gracefulTimeout = setTimeout(() => {
            console.warn('Graceful shutdown timeout, sending SIGTERM...');
            if (this.goProcess && !this.goProcess.killed) {
              this.goProcess.kill('SIGTERM');
            }
            resolve();
          }, 3000);

          if (this.goProcess) {
            this.goProcess.once('exit', () => {
              clearTimeout(gracefulTimeout);
              resolve();
            });
          } else {
            clearTimeout(gracefulTimeout);
            resolve();
          }
        });

        // Force kill if still running
        if (this.goProcess && !this.goProcess.killed) {
          console.warn('Process still running, sending SIGKILL...');
          await new Promise((resolve) => {
            const forceTimeout = setTimeout(() => {
              console.error('Failed to kill Go process');
              resolve();
            }, 2000);

            this.goProcess.kill('SIGKILL');
            this.goProcess.once('exit', () => {
              clearTimeout(forceTimeout);
              resolve();
            });
          });
        }
      } catch (error) {
        console.warn('Error during process cleanup:', error.message);
      }
    }

    // Clean up config file
    if (this.configFile && fs.existsSync(this.configFile)) {
      try {
        fs.unlinkSync(this.configFile);
        console.log('Cleaned up configuration file');
      } catch (error) {
        console.warn('Failed to clean up configuration file:', error.message);
      }
    }

    // Reset state
    this.goProcess = null;
    this.webServerPort = null;
    this.configFile = null;
    this.processReady = false;
    this.processStartTime = null;
    this.lastHeartbeat = null;

    console.log('Cleanup completed');
    this.emit('cleanup_complete');
  }
}

module.exports = ProcessCoordinator;