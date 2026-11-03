import { Component } from 'react';

export default class AppErrorBoundary extends Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('PhishGuard frontend rendering error:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="fatal-error">
          <span className="fatal-error-mark" aria-hidden="true">!</span>
          <h1>We hit a problem.</h1>
          <p>Your protection screen couldn't load. Reload the app to try again.</p>
          <button type="button" onClick={() => window.location.reload()}>Reload app</button>
        </main>
      );
    }

    return this.props.children;
  }
}
