// Error message utilities for better UX

export interface ErrorMessage {
  title: string;
  message: string;
}

export function formatAuthError(error: string | any): ErrorMessage {
  // Handle different types of errors
  if (typeof error === 'object' && error?.response?.data) {
    const data = error.response.data;
    if (typeof data === 'string') {
      return parseErrorString(data);
    }
    if (data.message) {
      return parseErrorString(data.message);
    }
    if (data.error) {
      return parseErrorString(data.error);
    }
  }

  if (typeof error === 'string') {
    return parseErrorString(error);
  }

  if (error?.message) {
    return parseErrorString(error.message);
  }

  return {
    title: 'Something went wrong',
    message: 'Please try again or contact support if the problem persists.'
  };
}

function parseErrorString(errorStr: string): ErrorMessage {
  const lowercaseError = errorStr.toLowerCase();

  // Username validation errors
  if (lowercaseError.includes('username') && lowercaseError.includes('alphanumeric')) {
    return {
      title: 'Invalid Username',
      message: 'Username must be 3-30 characters using only letters (A-Z, a-z) and numbers (0-9). No spaces or special characters allowed.'
    };
  }

  if (lowercaseError.includes('username') && lowercaseError.includes('taken')) {
    return {
      title: 'Username Unavailable',
      message: 'This username is already taken. Please choose a different one.'
    };
  }

  if (lowercaseError.includes('username') && lowercaseError.includes('exists')) {
    return {
      title: 'Username Unavailable',
      message: 'This username is already registered. Please choose a different one.'
    };
  }

  // Password validation errors
  if (lowercaseError.includes('password') && lowercaseError.includes('match')) {
    return {
      title: 'Passwords Don\'t Match',
      message: 'The passwords you entered don\'t match. Please make sure both password fields are identical.'
    };
  }

  if (lowercaseError.includes('password') && (lowercaseError.includes('weak') || lowercaseError.includes('strength'))) {
    return {
      title: 'Password Too Weak',
      message: 'Please choose a stronger password with at least 8 characters, including uppercase, lowercase, numbers, and symbols.'
    };
  }

  if (lowercaseError.includes('password') && lowercaseError.includes('required')) {
    return {
      title: 'Password Required',
      message: 'Please enter a password to continue.'
    };
  }

  // Login errors
  if (lowercaseError.includes('invalid') && (lowercaseError.includes('credentials') || lowercaseError.includes('login'))) {
    return {
      title: 'Login Failed',
      message: 'The username or password you entered is incorrect. Please check your credentials and try again.'
    };
  }

  if (lowercaseError.includes('user') && lowercaseError.includes('not found')) {
    return {
      title: 'Account Not Found',
      message: 'No account found with this username. Please check the spelling or create a new account.'
    };
  }

  // Network and server errors
  if (lowercaseError.includes('network') || lowercaseError.includes('fetch')) {
    return {
      title: 'Connection Problem',
      message: 'Unable to connect to the server. Please check your internet connection and try again.'
    };
  }

  if (lowercaseError.includes('timeout')) {
    return {
      title: 'Request Timeout',
      message: 'The request took too long to complete. Please try again.'
    };
  }

  if (lowercaseError.includes('server') && lowercaseError.includes('error')) {
    return {
      title: 'Server Error',
      message: 'Our servers are experiencing issues. Please try again in a few moments.'
    };
  }

  if (lowercaseError.includes('rate limit') || lowercaseError.includes('too many requests')) {
    return {
      title: 'Too Many Attempts',
      message: 'You\'re trying too fast. Please wait a moment before trying again.'
    };
  }

  // Registration specific errors
  if (lowercaseError.includes('registration') && lowercaseError.includes('failed')) {
    return {
      title: 'Registration Failed',
      message: 'Unable to create your account. Please check your information and try again.'
    };
  }

  if (lowercaseError.includes('key') && lowercaseError.includes('generation')) {
    return {
      title: 'Security Setup Failed',
      message: 'Failed to generate encryption keys. Please try registering again.'
    };
  }

  // Generic validation errors
  if (lowercaseError.includes('validation') || lowercaseError.includes('invalid')) {
    return {
      title: 'Invalid Input',
      message: 'Please check your information and make sure all fields are filled out correctly.'
    };
  }

  // Default case - clean up the original error message
  const cleanMessage = errorStr
    .replace(/^error:\s*/i, '')
    .replace(/^\w+Error:\s*/i, '')
    .trim();

  return {
    title: 'Error',
    message: cleanMessage || 'An unexpected error occurred. Please try again.'
  };
}

export function getValidationRules() {
  return {
    username: {
      minLength: 3,
      maxLength: 30,
      pattern: /^[a-zA-Z0-9]+$/,
      description: 'Use 3-30 letters and numbers only'
    },
    password: {
      minLength: 8,
      requirements: [
        'At least 8 characters',
        'Include uppercase letters (A-Z)',
        'Include lowercase letters (a-z)',
        'Include numbers (0-9)',
        'Include symbols (!@#$%^&*)'
      ]
    }
  };
}