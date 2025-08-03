const EventEmitter = require('events');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const net = require('net');

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
  }

  async findAvailablePort(startPort = 3000) {
    return new Promise((resolve, reject) => {
      const server = net.createServer();
      
      server.listen(startPort, () => {
        const port = server.address().port;
        server.close(() => resolve(port));
      });
      
      server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          // Port is in use, try next one
          this.findAvailablePort(startPort + 1).then(resolve).catch(reject);
        } else {
          reject(err);
        }
      });
    });
  }

  async createConfigFile(config) {
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
    return this.configFile;
  }

  async startGoProcess(config) {
    // Ensure binary is available
    const success = await this.binaryManager.ensureBinary();
    if (!success) {
      throw new Error('Failed to ensure Go binary is available');
    }

    // Find available port for web server
    this.webServerPort = await this.findAvailablePort();
    
    // Create configuration file
    const configFile = await this.createConfigFile(config);

    // Start Go process
    const binaryPath = this.binaryManager.getBinaryPath();
    const args = [
      '--config', configFile,
      '--port', this.webServerPort.toString(),
      '--mode', 'api'
    ];

    this.goProcess = spawn(binaryPath, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { 
        ...process.env, 
        NODE_ENV: 'production',
        HTTP_LOAD_TEST_MODE: 'api'
      }
    });

    this.setupProcessHandlers();
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (!this.processReady) {
          reject(new Error('Timeout waiting for Go process to start'));
        }
      }, 20000);

      this.once('process_ready', () => {
        clearTimeout(timeout);
        resolve();
      });

      this.once('process_error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  setupProcessHandlers() {
    let stdoutBuffer = '';
    let stderrBuffer = '';

    this.goProcess.stdout.on('data', (data) => {
      stdoutBuffer += data.toString();
      this.processStdoutBuffer(stdoutBuffer);
    });

    this.goProcess.stderr.on('data', (data) => {
      stderrBuffer += data.toString();
      this.processStderrBuffer(stderrBuffer);
    });

    this.goProcess.on('error', (error) => {
      this.emit('process_error', new Error(`Go process error: ${error.message}`));
    });

    this.goProcess.on('exit', (code, signal) => {
      if (!this.isShuttingDown && code !== 0) {
        this.emit('process_error', new Error(`Go process exited unexpectedly with code ${code} (signal: ${signal})`));
      }
      this.emit('process_exit', { code, signal });
    });

    // Handle process cleanup on Node.js exit
    process.on('exit', () => this.cleanup());
    process.on('SIGINT', () => this.cleanup());
    process.on('SIGTERM', () => this.cleanup());
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

  async makeHttpRequest(endpoint, options = {}) {
    if (!this.webServerPort) {
      throw new Error('Web server port not available');
    }

    const http = require('http');
    
    return new Promise((resolve, reject) => {
      const requestOptions = {
        hostname: 'localhost',
        port: this.webServerPort,
        path: endpoint,
        method: options.method || 'GET',
        headers: options.headers || {}
      };

      const req = http.request(requestOptions, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            const result = res.headers['content-type']?.includes('application/json') 
              ? JSON.parse(data) 
              : data;
            resolve({ statusCode: res.statusCode, data: result });
          } catch (error) {
            resolve({ statusCode: res.statusCode, data: data });
          }
        });
      });

      req.on('error', (error) => {
        reject(new Error(`HTTP request failed: ${error.message}`));
      });

      if (options.body) {
        req.write(options.body);
      }

      req.end();

      // Timeout after 30 seconds
      setTimeout(() => {
        req.destroy();
        reject(new Error('HTTP request timeout'));
      }, 30000);
    });
  }

  async getStatus() {
    try {
      const response = await this.makeHttpRequest('/api/status');
      return response.data;
    } catch (error) {
      throw new Error(`Failed to get status: ${error.message}`);
    }
  }

  async getResults() {
    try {
      const response = await this.makeHttpRequest('/api/results');
      return response.data;
    } catch (error) {
      throw new Error(`Failed to get results: ${error.message}`);
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

  async cleanup() {
    this.isShuttingDown = true;

    // Stop the Go process gracefully
    if (this.goProcess && !this.goProcess.killed) {
      this.sendMessage({ type: 'shutdown' });
      
      // Give it time to shutdown gracefully
      setTimeout(() => {
        if (this.goProcess && !this.goProcess.killed) {
          this.goProcess.kill('SIGTERM');
          
          // Force kill after 5 seconds
          setTimeout(() => {
            if (this.goProcess && !this.goProcess.killed) {
              this.goProcess.kill('SIGKILL');
            }
          }, 5000);
        }
      }, 2000);
    }

    // Clean up config file
    if (this.configFile && fs.existsSync(this.configFile)) {
      try {
        fs.unlinkSync(this.configFile);
      } catch (error) {
        // Ignore cleanup errors
      }
    }

    this.emit('cleanup_complete');
  }
}

module.exports = ProcessCoordinator;