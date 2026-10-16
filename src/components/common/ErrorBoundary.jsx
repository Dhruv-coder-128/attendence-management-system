import React from 'react';
import { AlertTriangle, RefreshCw, Trash2, Mail, MessageSquare } from 'lucide-react';
import { openExternalLink } from '../../lib/externalOpener';
import { getStoredAcademySettings } from '../../lib/academySettings';

/**
 * Enterprise Application Error Boundary
 * Prevents blank white screens by intercepting uncaught runtime exceptions,
 * providing one-click recovery, diagnostics, and developer support channels.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('SMS ErrorBoundary intercepted error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReload = () => {
    window.location.reload();
  };

  handleResetCache = () => {
    try {
      localStorage.removeItem('sms_school_license');
      localStorage.removeItem('supabase.auth.token');
      sessionStorage.clear();
    } catch (e) {
      console.warn('Cache clearing error:', e);
    }
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      const errorMessage = this.state.error?.message || 'Unknown runtime error';

      return (
        <div
          style={{
            minHeight: '100vh',
            backgroundColor: '#070e19',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
            color: '#ffffff',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '560px',
              backgroundColor: '#0f172a',
              border: '1px solid #1e293b',
              borderRadius: '12px',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
              overflow: 'hidden',
            }}
          >
            {/* Header */}
            <div
              style={{
                backgroundColor: '#1e293b',
                padding: '20px 24px',
                borderBottom: '1px solid #334155',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
              }}
            >
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#ef4444',
                }}
              >
                <AlertTriangle size={22} />
              </div>
              <div>
                <h2 style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: '#f8fafc' }}>
                  System Recovery Mode
                </h2>
                <p style={{ margin: '2px 0 0 0', fontSize: '12.5px', color: '#94a3b8' }}>
                  SMS — Student Management System
                </p>
              </div>
            </div>

            {/* Content */}
            <div style={{ padding: '24px' }}>
              <p style={{ fontSize: '13.5px', color: '#cbd5e1', lineHeight: 1.5, margin: '0 0 16px 0' }}>
                The application encountered an unexpected runtime state. You can reload the application or reset the temporary session cache below.
              </p>

              {/* Error Box */}
              <div
                style={{
                  backgroundColor: '#070e19',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  padding: '12px 14px',
                  marginBottom: '20px',
                  fontSize: '12px',
                  fontFamily: 'monospace',
                  color: '#f87171',
                  overflowX: 'auto',
                }}
              >
                {errorMessage}
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
                <button
                  type="button"
                  onClick={this.handleReload}
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    padding: '10px 16px',
                    backgroundColor: '#d97706',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '6px',
                    fontWeight: 600,
                    fontSize: '13px',
                    cursor: 'pointer',
                  }}
                >
                  <RefreshCw size={15} /> Reload Application
                </button>
                <button
                  type="button"
                  onClick={this.handleResetCache}
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    padding: '10px 16px',
                    backgroundColor: '#1e293b',
                    color: '#cbd5e1',
                    border: '1px solid #475569',
                    borderRadius: '6px',
                    fontWeight: 500,
                    fontSize: '13px',
                    cursor: 'pointer',
                  }}
                >
                  <Trash2 size={15} /> Reset Cache & Reload
                </button>
              </div>

              {/* Developer Support footer */}
              <div
                style={{
                  borderTop: '1px solid #1e293b',
                  paddingTop: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: '12px',
                  color: '#94a3b8',
                }}
              >
                <span>System Helpdesk &amp; Technical Support</span>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    type="button"
                    onClick={() => {
                      const settings = getStoredAcademySettings();
                      const email = settings.email || 'support@institution.edu';
                      openExternalLink(`mailto:${email}?subject=SMS%20Desktop%20Error%20Report`);
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#38bdf8',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontSize: '12px',
                    }}
                  >
                    <Mail size={13} /> Email Helpdesk
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
