# HTTP Load Test - Cross-platform build configuration

# Binary name
BINARY_NAME=http-load-test

# Build directory
BUILD_DIR=bin

# Go build flags
LDFLAGS=-ldflags "-s -w"

# Default target
.PHONY: all
all: clean build

# Clean build artifacts
.PHONY: clean
clean:
	rm -rf $(BUILD_DIR)
	mkdir -p $(BUILD_DIR)

# Build for current platform
.PHONY: build
build: clean
	go build $(LDFLAGS) -o $(BUILD_DIR)/$(BINARY_NAME) ./cmd/http-load-test

# Build for all platforms
.PHONY: build-all
build-all: clean build-linux build-darwin build-windows

# Build for Linux (amd64)
.PHONY: build-linux
build-linux:
	GOOS=linux GOARCH=amd64 go build $(LDFLAGS) -o $(BUILD_DIR)/$(BINARY_NAME)-linux-amd64 ./cmd/http-load-test

# Build for Linux (arm64)
.PHONY: build-linux-arm64
build-linux-arm64:
	GOOS=linux GOARCH=arm64 go build $(LDFLAGS) -o $(BUILD_DIR)/$(BINARY_NAME)-linux-arm64 ./cmd/http-load-test

# Build for macOS (amd64)
.PHONY: build-darwin
build-darwin:
	GOOS=darwin GOARCH=amd64 go build $(LDFLAGS) -o $(BUILD_DIR)/$(BINARY_NAME)-darwin-amd64 ./cmd/http-load-test

# Build for macOS (arm64 - Apple Silicon)
.PHONY: build-darwin-arm64
build-darwin-arm64:
	GOOS=darwin GOARCH=arm64 go build $(LDFLAGS) -o $(BUILD_DIR)/$(BINARY_NAME)-darwin-arm64 ./cmd/http-load-test

# Build for Windows (amd64)
.PHONY: build-windows
build-windows:
	GOOS=windows GOARCH=amd64 go build $(LDFLAGS) -o $(BUILD_DIR)/$(BINARY_NAME)-windows-amd64.exe ./cmd/http-load-test

# Test Go code
.PHONY: test
test:
	go test -v ./...

# Run Go code
.PHONY: run
run:
	go run ./cmd/http-load-test

# Install dependencies
.PHONY: deps
deps:
	go mod tidy
	go mod download

# Development build with debug info
.PHONY: build-dev
build-dev: clean
	go build -o $(BUILD_DIR)/$(BINARY_NAME) ./cmd/http-load-test

# Help target
.PHONY: help
help:
	@echo "Available targets:"
	@echo "  all          - Clean and build for current platform"
	@echo "  build        - Build for current platform"
	@echo "  build-all    - Build for all supported platforms"
	@echo "  build-linux  - Build for Linux (amd64)"
	@echo "  build-darwin - Build for macOS (amd64)"
	@echo "  build-windows- Build for Windows (amd64)"
	@echo "  test         - Run Go tests"
	@echo "  run          - Run the application"
	@echo "  clean        - Clean build artifacts"
	@echo "  deps         - Install/update dependencies"
	@echo "  help         - Show this help message"