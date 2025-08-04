#!/usr/bin/env node

// Simple test runner to verify our components work
import { execSync } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

console.log('🧪 Running tests for real-time chart components...\n')

try {
  // Run TypeScript compilation check
  console.log('📝 Checking TypeScript compilation...')
  execSync('npx tsc --noEmit --skipLibCheck', { 
    cwd: __dirname, 
    stdio: 'inherit' 
  })
  console.log('✅ TypeScript compilation passed\n')

  // Run the tests
  console.log('🔬 Running component tests...')
  execSync('npx vitest run --reporter=verbose', { 
    cwd: __dirname, 
    stdio: 'inherit' 
  })
  console.log('✅ All tests passed!')

} catch (error) {
  console.error('❌ Tests failed:', error.message)
  process.exit(1)
}