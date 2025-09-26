#!/bin/bash

# PwnChat Release Build Script
# Automates the entire release process from build to distribution

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PLATFORMS=("win" "mac" "linux")
BUILD_DIR="release"
LOG_DIR="build-logs"

# Functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_dependencies() {
    log_info "Checking dependencies..."

    # Check Node.js
    if ! command -v node &> /dev/null; then
        log_error "Node.js is not installed"
        exit 1
    fi

    # Check npm
    if ! command -v npm &> /dev/null; then
        log_error "npm is not installed"
        exit 1
    fi

    # Check git
    if ! command -v git &> /dev/null; then
        log_error "git is not installed"
        exit 1
    fi

    # Check if we're in a git repository
    if ! git rev-parse --git-dir > /dev/null 2>&1; then
        log_error "Not in a git repository"
        exit 1
    fi

    log_success "All dependencies are available"
}

check_git_status() {
    log_info "Checking git status..."

    # Check if working directory is clean
    if [[ -n $(git status --porcelain) ]]; then
        log_warning "Working directory is not clean"
        git status --short

        read -p "Continue anyway? [y/N]: " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log_info "Aborting release"
            exit 1
        fi
    fi

    log_success "Git status is clean"
}

install_dependencies() {
    log_info "Installing dependencies..."

    # Frontend dependencies
    npm ci

    # Backend dependencies
    if [ -d "backend" ]; then
        log_info "Installing backend dependencies..."
        cd backend
        npm ci
        cd ..
    fi

    log_success "Dependencies installed"
}

build_native() {
    log_info "Building native modules..."

    npm run build:native

    log_success "Native modules built"
}

build_application() {
    log_info "Building application..."

    npm run build

    log_success "Application built"
}

generate_icons() {
    log_info "Generating application icons..."

    if [ -f "build/icons/icon.svg" ]; then
        npm run build:icons
        log_success "Icons generated"
    else
        log_warning "SVG icon not found at build/icons/icon.svg"
        log_warning "Using default icons"
    fi
}

run_tests() {
    log_info "Running tests..."

    # Frontend tests
    if npm run test --if-present > /dev/null 2>&1; then
        npm run test
    else
        log_warning "No frontend tests found"
    fi

    # Backend tests
    if [ -d "backend" ] && [ -f "backend/package.json" ]; then
        cd backend
        if npm run test --if-present > /dev/null 2>&1; then
            npm run test
        else
            log_warning "No backend tests found"
        fi
        cd ..
    fi

    # Native module tests
    if npm run test:native --if-present > /dev/null 2>&1; then
        npm run test:native
    else
        log_warning "No native tests found"
    fi

    log_success "Tests completed"
}

package_application() {
    local platform=$1
    log_info "Packaging for $platform..."

    mkdir -p "$LOG_DIR"

    case $platform in
        "win")
            npm run dist:win > "$LOG_DIR/build-windows.log" 2>&1
            ;;
        "mac")
            npm run dist:mac > "$LOG_DIR/build-macos.log" 2>&1
            ;;
        "linux")
            npm run dist:linux > "$LOG_DIR/build-linux.log" 2>&1
            ;;
        "all")
            npm run dist:all > "$LOG_DIR/build-all.log" 2>&1
            ;;
        *)
            log_error "Unknown platform: $platform"
            return 1
            ;;
    esac

    if [ $? -eq 0 ]; then
        log_success "Packaging for $platform completed"
    else
        log_error "Packaging for $platform failed. Check $LOG_DIR/build-$platform.log"
        return 1
    fi
}

calculate_checksums() {
    log_info "Calculating checksums..."

    if [ -d "$BUILD_DIR" ]; then
        cd "$BUILD_DIR"

        # Find all distribution files
        find . -name "*.exe" -o -name "*.dmg" -o -name "*.AppImage" -o -name "*.deb" -o -name "*.rpm" -o -name "*.msi" | \
        while read file; do
            sha256sum "$file" >> checksums.txt
        done

        if [ -f "checksums.txt" ]; then
            log_success "Checksums calculated"
            cat checksums.txt
        else
            log_warning "No distribution files found for checksum calculation"
        fi

        cd ..
    else
        log_warning "Release directory not found"
    fi
}

show_usage() {
    echo "Usage: $0 [OPTIONS] [PLATFORM]"
    echo ""
    echo "Build and package PwnChat for distribution"
    echo ""
    echo "PLATFORMS:"
    echo "  win     Build for Windows only"
    echo "  mac     Build for macOS only"
    echo "  linux   Build for Linux only"
    echo "  all     Build for all platforms (default)"
    echo ""
    echo "OPTIONS:"
    echo "  --skip-tests    Skip running tests"
    echo "  --skip-clean    Skip cleaning previous builds"
    echo "  --skip-deps     Skip dependency installation"
    echo "  --help          Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0                  # Build for all platforms"
    echo "  $0 win              # Build for Windows only"
    echo "  $0 --skip-tests     # Build all, skip tests"
}

main() {
    local platform="all"
    local skip_tests=false
    local skip_clean=false
    local skip_deps=false

    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --skip-tests)
                skip_tests=true
                shift
                ;;
            --skip-clean)
                skip_clean=true
                shift
                ;;
            --skip-deps)
                skip_deps=true
                shift
                ;;
            --help)
                show_usage
                exit 0
                ;;
            win|mac|linux|all)
                platform=$1
                shift
                ;;
            *)
                log_error "Unknown option: $1"
                show_usage
                exit 1
                ;;
        esac
    done

    echo -e "${BLUE}"
    echo "╔══════════════════════════════════════╗"
    echo "║         PwnChat Release Build        ║"
    echo "╚══════════════════════════════════════╝"
    echo -e "${NC}"

    log_info "Starting release build for platform: $platform"
    log_info "Build directory: $BUILD_DIR"
    log_info "Log directory: $LOG_DIR"

    # Create directories
    mkdir -p "$LOG_DIR"

    # Pre-flight checks
    check_dependencies
    check_git_status

    # Clean previous builds
    if [ "$skip_clean" = false ]; then
        log_info "Cleaning previous builds..."
        rm -rf "$BUILD_DIR"
        rm -rf dist
        rm -rf dist-electron
        log_success "Previous builds cleaned"
    fi

    # Install dependencies
    if [ "$skip_deps" = false ]; then
        install_dependencies
    fi

    # Build process
    generate_icons
    build_native
    build_application

    # Run tests
    if [ "$skip_tests" = false ]; then
        run_tests
    fi

    # Package application
    if [ "$platform" = "all" ]; then
        for p in "${PLATFORMS[@]}"; do
            package_application "$p" || true  # Continue on failure
        done
    else
        package_application "$platform"
    fi

    # Generate checksums
    calculate_checksums

    # Summary
    echo ""
    log_success "Release build completed!"

    if [ -d "$BUILD_DIR" ]; then
        log_info "Distribution files:"
        find "$BUILD_DIR" -name "*.exe" -o -name "*.dmg" -o -name "*.AppImage" -o -name "*.deb" -o -name "*.rpm" -o -name "*.msi" | \
        sed 's/^/  /'
    fi

    echo ""
    log_info "Next steps:"
    echo "  1. Test the distribution files"
    echo "  2. Verify checksums"
    echo "  3. Create release with: npm run version:patch && git push --tags"
    echo "  4. Upload to distribution channels"
}

# Run main function with all arguments
main "$@"