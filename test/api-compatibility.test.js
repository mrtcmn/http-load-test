#!/usr/bin/env node

const HttpLoadTest = require('../index');
const { CONFIG_PARAMS } = require('../constant');
const EventEmitter = require('events');

console.log('Running API Compatibility Tests...\n');

function test(name, fn) {
  return new Promise((resolve) => {
    try {
      const result = fn();
      if (result instanceof Promise) {
        result
          .then(() => {
            console.log(`✓ ${name}`);
            resolve();
          })
          .catch((error) => {
            console.log(`✗ ${name}: ${error.message}`);
            resolve();
          });
      } else {
        console.log(`✓ ${name}`);
        resolve();
      }
    } catch (error) {
      console.log(`✗ ${name}: ${error.message}`);
      resolve();
    }
  });
}

function expect(actual) {
  return {
    toBe: (expected) => {
      if (actual !== expected) {
        throw new Error(`Expected ${expected}, got ${actual}`);
      }
    },
    toBeInstanceOf: (expectedClass) => {
      if (!(actual instanceof expectedClass)) {
        throw new Error(`Expected instance of ${expectedClass.name}, got ${actual.constructor.name}`);
      }
    },
    toBeTruthy: () => {
      if (!actual) {
        throw new Error(`Expected ${actual} to be truthy`);
      }
    },
    toHaveProperty: (property) => {
      if (!(property in actual)) {
        throw new Error(`Expected object to have property ${property}`);
      }
    },
    toBeTypeOf: (expectedType) => {
      if (typeof actual !== expectedType) {
        throw new Error(`Expected type ${expectedType}, got ${typeof actual}`);
      }
    }
  };
}

async function runTests() {
  console.log('--- API Compatibility Tests ---');

  await test('should create HttpLoadTest instance with basic config', () => {
    const config = {
      [CONFIG_PARAMS.URL]: 'http://example.com',
      [CONFIG_PARAMS.TOTAL_REQUEST]: 5,
      [CONFIG_PARAMS.PER_SECOND_REQUEST]: 2
    };
    
    const loadTest = new HttpLoadTest(config);
    
    expect(loadTest).toBeInstanceOf(HttpLoadTest);
    expect(loadTest).toBeInstanceOf(EventEmitter);
    expect(loadTest.TOTAL_REQUEST).toBe(5);
    expect(loadTest.PER_SECOND_REQUEST).toBe(2);
    expect(loadTest.CONCURRENT_REQUEST).toBe(1); // default value
  });

  await test('should handle all configuration parameters', () => {
    const config = {
      [CONFIG_PARAMS.URL]: 'https://api.example.com/test',
      [CONFIG_PARAMS.METHOD]: 'POST',
      [CONFIG_PARAMS.TOTAL_REQUEST]: 10,
      [CONFIG_PARAMS.PER_SECOND_REQUEST]: 5,
      [CONFIG_PARAMS.CONCURRENT_REQUEST]: 3,
      [CONFIG_PARAMS.HEADERS]: { 'Content-Type': 'application/json' },
      [CONFIG_PARAMS.DATA]: { test: 'data' },
      [CONFIG_PARAMS.OTHER_AXIOS_REQUEST_CONFIGS]: { timeout: 5000 }
    };
    
    const loadTest = new HttpLoadTest(config);
    
    expect(loadTest.TOTAL_REQUEST).toBe(10);
    expect(loadTest.PER_SECOND_REQUEST).toBe(5);
    expect(loadTest.CONCURRENT_REQUEST).toBe(3);
    expect(loadTest.AXIOS_REQUEST_CONFIG.url).toBe('https://api.example.com/test');
    expect(loadTest.AXIOS_REQUEST_CONFIG.method).toBe('POST');
    expect(loadTest.AXIOS_REQUEST_CONFIG.timeout).toBe(5000);
  });

  await test('should throw error for invalid config', () => {
    try {
      new HttpLoadTest(null);
      throw new Error('Should have thrown error');
    } catch (error) {
      expect(error.message).toBe('At least one config parameter needs to be provided.');
    }
  });

  await test('should have setRequestSuccessChecker method', () => {
    const loadTest = new HttpLoadTest({ [CONFIG_PARAMS.URL]: 'http://example.com' });
    
    expect(loadTest.setRequestSuccessChecker).toBeTypeOf('function');
    
    const checker = (response) => response.status === 200;
    loadTest.setRequestSuccessChecker(checker);
    
    expect(loadTest.successChecker).toBe(checker);
  });

  await test('should have setDynamicDataFunction method', () => {
    const loadTest = new HttpLoadTest({ [CONFIG_PARAMS.URL]: 'http://example.com' });
    
    expect(loadTest.setDynamicDataFunction).toBeTypeOf('function');
    
    const dynamicFunc = () => ({ timestamp: Date.now() });
    loadTest.setDynamicDataFunction(dynamicFunc);
    
    expect(loadTest.dynamicDataFunction).toBe(dynamicFunc);
  });

  await test('should have startTest method', () => {
    const loadTest = new HttpLoadTest({ [CONFIG_PARAMS.URL]: 'http://example.com' });
    
    expect(loadTest.startTest).toBeTypeOf('function');
  });

  await test('should have oneJob method for backward compatibility', () => {
    const loadTest = new HttpLoadTest({ [CONFIG_PARAMS.URL]: 'http://example.com' });
    
    expect(loadTest.oneJob).toBeTypeOf('function');
  });

  await test('should inherit from EventEmitter', () => {
    const loadTest = new HttpLoadTest({ [CONFIG_PARAMS.URL]: 'http://example.com' });
    
    expect(loadTest).toBeInstanceOf(EventEmitter);
    expect(loadTest.on).toBeTypeOf('function');
    expect(loadTest.emit).toBeTypeOf('function');
  });

  await test('should initialize stats object correctly', () => {
    const loadTest = new HttpLoadTest({ 
      [CONFIG_PARAMS.URL]: 'http://example.com',
      [CONFIG_PARAMS.TOTAL_REQUEST]: 15
    });
    
    expect(loadTest.stats).toBeTruthy();
    expect(loadTest.stats.passed).toBe(0);
    expect(loadTest.stats.failed).toBe(0);
    expect(loadTest.stats.totalRequest).toBe(15);
  });

  await test('should handle success checker in config', () => {
    const checker = (response) => response.status === 200;
    const config = {
      [CONFIG_PARAMS.URL]: 'http://example.com',
      [CONFIG_PARAMS.SUCCESS_CHECKER_FN]: checker
    };
    
    const loadTest = new HttpLoadTest(config);
    
    expect(loadTest.successChecker).toBe(checker);
  });

  await test('should handle invalid requestConfig', () => {
    try {
      new HttpLoadTest({
        [CONFIG_PARAMS.URL]: 'http://example.com',
        [CONFIG_PARAMS.OTHER_AXIOS_REQUEST_CONFIGS]: 'invalid'
      });
      throw new Error('Should have thrown error');
    } catch (error) {
      expect(error.message).toBe('requestConfig is not a valid object.');
    }
  });

  await test('should create config file correctly', async () => {
    const loadTest = new HttpLoadTest({
      [CONFIG_PARAMS.URL]: 'http://example.com',
      [CONFIG_PARAMS.METHOD]: 'POST',
      [CONFIG_PARAMS.HEADERS]: { 'Authorization': 'Bearer token' },
      [CONFIG_PARAMS.DATA]: { test: 'data' }
    });
    
    const configFile = await loadTest.createConfigFile();
    
    expect(configFile).toBeTruthy();
    expect(configFile).toBeTypeOf('string');
    
    // Clean up
    const fs = require('fs');
    if (fs.existsSync(configFile)) {
      fs.unlinkSync(configFile);
    }
  });

  console.log('\n--- API Compatibility Tests Completed ---');
}

// Run tests
runTests().catch((error) => {
  console.error('Test runner error:', error.message);
  process.exit(1);
});