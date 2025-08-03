const { ErrorHandler, LoadTestError, ErrorTypes, ErrorCodes } = require('../lib/ErrorHandler');
const HttpLoadTest = require('../lib/HttpLoadTest');

describe('Error Handling', () => {
  describe('LoadTestError', () => {
    test('should create error with proper structure', () => {
      const error = new LoadTestError(
        ErrorTypes.NETWORK,
        ErrorCodes.CONNECTION_REFUSED,
        'Connection refused',
        null,
        { host: 'example.com' }
      );

      expect(error.type).toBe(ErrorTypes.NETWORK);
      expect(error.code).toBe(ErrorCodes.CONNECTION_REFUSED);
      expect(error.message).toBe('Connection refused');
      expect(error.context.host).toBe('example.com');
      expect(error.recoverable).toBe(true);
    });

    test('should provide user-friendly messages', () => {
      const error = new LoadTestError(
        ErrorTypes.NETWORK,
        ErrorCodes.CONNECTION_REFUSED,
        'Connection refused'
      );

      const userMessage = error.getUserMessage();
      expect(userMessage).toContain('Connection to the target server was refused');
    });

    test('should provide troubleshooting steps', () => {
      const error = new LoadTestError(
        ErrorTypes.BINARY_MANAGEMENT,
        ErrorCodes.BINARY_DOWNLOAD_FAILED,
        'Download failed'
      );

      const steps = error.getTroubleshootingSteps();
      expect(Array.isArray(steps)).toBe(true);
      expect(steps.length).toBeGreaterThan(0);
      expect(steps[0]).toContain('internet connection');
    });

    test('should serialize to JSON properly', () => {
      const originalError = new Error('Original error');
      const error = new LoadTestError(
        ErrorTypes.SYSTEM,
        ErrorCodes.FILE_SYSTEM_ERROR,
        'File system error',
        originalError,
        { path: '/tmp/test' }
      );

      const json = error.toJSON();
      expect(json.type).toBe(ErrorTypes.SYSTEM);
      expect(json.code).toBe(ErrorCodes.FILE_SYSTEM_ERROR);
      expect(json.context.path).toBe('/tmp/test');
      expect(json.originalError.message).toBe('Original error');
    });
  });

  describe('ErrorHandler', () => {
    let errorHandler;

    beforeEach(() => {
      errorHandler = new ErrorHandler();
    });

    test('should categorize generic errors', () => {
      const networkError = new Error('ECONNREFUSED');
      const categorized = errorHandler.categorizeError(networkError);

      expect(categorized).toBeInstanceOf(LoadTestError);
      expect(categorized.type).toBe(ErrorTypes.NETWORK);
      expect(categorized.code).toBe(ErrorCodes.CONNECTION_REFUSED);
    });

    test('should handle retry logic', async () => {
      const error = new LoadTestError(
        ErrorTypes.NETWORK,
        ErrorCodes.NETWORK_TIMEOUT,
        'Timeout'
      );

      const result = await errorHandler.handleError(error, {}, 'test-operation');
      expect(result.shouldRetry).toBe(true);
      expect(result.attempt).toBe(1);
    });

    test('should track error statistics', () => {
      const error1 = new LoadTestError(ErrorTypes.NETWORK, ErrorCodes.CONNECTION_REFUSED, 'Error 1');
      const error2 = new LoadTestError(ErrorTypes.NETWORK, ErrorCodes.NETWORK_TIMEOUT, 'Error 2');
      const error3 = new LoadTestError(ErrorTypes.BINARY_MANAGEMENT, ErrorCodes.BINARY_NOT_FOUND, 'Error 3');

      errorHandler.addToHistory(error1);
      errorHandler.addToHistory(error2);
      errorHandler.addToHistory(error3);

      const stats = errorHandler.getErrorStats();
      expect(stats.total).toBe(3);
      expect(stats.byType[ErrorTypes.NETWORK]).toBe(2);
      expect(stats.byType[ErrorTypes.BINARY_MANAGEMENT]).toBe(1);
      expect(stats.byCode[ErrorCodes.CONNECTION_REFUSED]).toBe(1);
    });

    test('should create specific error types', () => {
      const binaryError = errorHandler.createBinaryError(
        ErrorCodes.BINARY_NOT_FOUND,
        'Binary not found'
      );
      expect(binaryError.type).toBe(ErrorTypes.BINARY_MANAGEMENT);

      const processError = errorHandler.createProcessError(
        ErrorCodes.PROCESS_START_FAILED,
        'Process failed'
      );
      expect(processError.type).toBe(ErrorTypes.PROCESS_COMMUNICATION);

      const configError = errorHandler.createConfigError(
        ErrorCodes.INVALID_CONFIG,
        'Invalid config'
      );
      expect(configError.type).toBe(ErrorTypes.CONFIGURATION);
    });
  });

  describe('HttpLoadTest Error Handling', () => {
    test('should handle invalid configuration', () => {
      expect(() => {
        new HttpLoadTest(null);
      }).toThrow();

      expect(() => {
        new HttpLoadTest({});
      }).toThrow();
    });

    test('should validate URL parameter', () => {
      expect(() => {
        new HttpLoadTest({ url: 'invalid-url' });
      }).toThrow();

      expect(() => {
        new HttpLoadTest({ url: 'ftp://example.com' });
      }).toThrow();
    });

    test('should validate numeric parameters', () => {
      expect(() => {
        new HttpLoadTest({
          url: 'http://example.com',
          totalRequest: -1
        });
      }).toThrow();

      expect(() => {
        new HttpLoadTest({
          url: 'http://example.com',
          psRequest: 0
        });
      }).toThrow();
    });

    test('should validate HTTP method', () => {
      expect(() => {
        new HttpLoadTest({
          url: 'http://example.com',
          method: 'INVALID'
        });
      }).toThrow();
    });

    test('should validate success checker function', () => {
      expect(() => {
        new HttpLoadTest({
          url: 'http://example.com',
          successChecker: 'not a function'
        });
      }).toThrow();
    });

    test('should provide diagnostics', () => {
      const loadTest = new HttpLoadTest({
        url: 'http://example.com',
        totalRequest: 10
      });

      const diagnostics = loadTest.getDiagnostics();
      expect(diagnostics).toHaveProperty('testInfo');
      expect(diagnostics).toHaveProperty('configuration');
      expect(diagnostics).toHaveProperty('processCoordinator');
      expect(diagnostics).toHaveProperty('errorStats');
    });

    test('should provide health status', () => {
      const loadTest = new HttpLoadTest({
        url: 'http://example.com'
      });

      const health = loadTest.getHealthStatus();
      expect(health).toHaveProperty('overall');
      expect(health).toHaveProperty('binary');
      expect(health).toHaveProperty('process');
      expect(health).toHaveProperty('lastCheck');
    });

    test('should generate error report', () => {
      const loadTest = new HttpLoadTest({
        url: 'http://example.com'
      });

      const report = loadTest.generateErrorReport();
      expect(report).toHaveProperty('timestamp');
      expect(report).toHaveProperty('health');
      expect(report).toHaveProperty('diagnostics');
      expect(report).toHaveProperty('recommendations');
      expect(Array.isArray(report.recommendations)).toBe(true);
    });
  });

  describe('Error Recovery', () => {
    test('should identify recoverable errors', () => {
      const recoverableError = new LoadTestError(
        ErrorTypes.NETWORK,
        ErrorCodes.NETWORK_TIMEOUT,
        'Timeout'
      );
      expect(recoverableError.isRecoverable()).toBe(true);

      const nonRecoverableError = new LoadTestError(
        ErrorTypes.CONFIGURATION,
        ErrorCodes.INVALID_CONFIG,
        'Invalid config'
      );
      expect(nonRecoverableError.isRecoverable()).toBe(false);
    });

    test('should provide appropriate error messages for different error types', () => {
      const errors = [
        {
          type: ErrorTypes.BINARY_MANAGEMENT,
          code: ErrorCodes.BINARY_DOWNLOAD_FAILED,
          expectedMessage: 'download'
        },
        {
          type: ErrorTypes.NETWORK,
          code: ErrorCodes.CONNECTION_REFUSED,
          expectedMessage: 'Connection'
        },
        {
          type: ErrorTypes.CONFIGURATION,
          code: ErrorCodes.INVALID_CONFIG,
          expectedMessage: 'configuration'
        }
      ];

      errors.forEach(({ type, code, expectedMessage }) => {
        const error = new LoadTestError(type, code, 'Test error');
        const userMessage = error.getUserMessage();
        expect(userMessage.toLowerCase()).toContain(expectedMessage.toLowerCase());
      });
    });
  });
});