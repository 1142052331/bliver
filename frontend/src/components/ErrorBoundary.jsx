import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-gray-900 p-8">
          <div className="bg-white rounded-2xl p-6 max-w-lg w-full shadow-2xl">
            <h2 className="text-lg font-bold text-red-600 mb-2">页面出错了</h2>
            <p className="text-sm text-gray-600 mb-3">
              请尝试刷新页面，或将此错误信息反馈给管理员。
            </p>
            <pre className="bg-gray-100 rounded-xl p-3 text-xs text-gray-700 overflow-auto max-h-40 mb-4">
              {this.state.error?.message || String(this.state.error)}
            </pre>
            <button
              onClick={() => {
                this.setState({ error: null });
                window.location.reload();
              }}
              className="w-full py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
            >
              刷新页面
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
