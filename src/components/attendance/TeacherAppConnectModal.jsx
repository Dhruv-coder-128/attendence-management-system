import React, { useState, useEffect } from 'react';
import {
  Copy,
  Check,
  ExternalLink,
  Radio,
  RefreshCw,
  ShieldCheck,
  Wifi,
} from 'lucide-react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import { checkHubConnection } from '../../lib/localWifiHubService';
import { resolveHubInfo } from '../../lib/useSchoolDatabaseSync';

export default function TeacherAppConnectModal({ isOpen, onClose }) {
  const [copied, setCopied] = useState(false);
  const [ipInput, setIpInput] = useState('192.168.0.104');
  const [portInput, setPortInput] = useState('5173');
  const [hubToken, setHubToken] = useState('');
  const [pairingOtp, setPairingOtp] = useState('482910');
  const [registeredDevicesCount, setRegisteredDevicesCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [hubStatus, setHubStatus] = useState(null);

  const loadStatus = React.useCallback(async () => {
    setIsLoading(true);

    // 1. Try resolving via Tauri native IPC or active hub info
    try {
      const info = await resolveHubInfo();
      if (info) {
        if (info.localIp && info.localIp !== '127.0.0.1' && info.localIp !== '0.0.0.0') {
          setIpInput(info.localIp);
        }
        if (info.port) {
          setPortInput(String(info.port));
        }
        if (info.token) {
          setHubToken(info.token);
        }
        if (info.otp) {
          setPairingOtp(info.otp);
        }
        if (typeof info.registeredDevicesCount === 'number') {
          setRegisteredDevicesCount(info.registeredDevicesCount);
        }
      }
    } catch {}

    // 2. Also check connectivity via HTTP ping
    try {
      const res = await checkHubConnection(`http://127.0.0.1:${portInput}`);
      if (res.ok && res.data) {
        setHubStatus(res.data);
        if (res.data.localIp && res.data.localIp !== '127.0.0.1' && res.data.localIp !== '0.0.0.0') {
          setIpInput(res.data.localIp);
        }
        if (res.data.port) {
          setPortInput(String(res.data.port));
        }
        if (res.data.token) {
          setHubToken(res.data.token);
        }
        if (res.data.otp) {
          setPairingOtp(res.data.otp);
        }
        if (typeof res.data.registeredDevicesCount === 'number') {
          setRegisteredDevicesCount(res.data.registeredDevicesCount);
        }
      }
    } catch {}

    setIsLoading(false);
  }, [portInput]);

  // Periodic polling every 3.5s while open to auto-detect Wi-Fi network changes
  useEffect(() => {
    if (!isOpen) return;
    loadStatus();
    const timer = setInterval(() => {
      loadStatus();
    }, 3500);

    const handleOnline = () => loadStatus();
    window.addEventListener('online', handleOnline);

    return () => {
      clearInterval(timer);
      window.removeEventListener('online', handleOnline);
    };
  }, [isOpen, loadStatus]);

  const handleRegenerateOtp = async () => {
    try {
      const res = await fetch(`http://127.0.0.1:${portInput}/api/local-hub?action=regenerate_otp`);
      if (res.ok) {
        const data = await res.json();
        if (data.otp) setPairingOtp(data.otp);
      }
    } catch {}
  };

  const activeIp = ipInput.trim() || '192.168.0.104';
  const activePort = portInput.trim() || '5173';
  const queryParams = new URLSearchParams();
  queryParams.set('portal', 'teacher');
  if (hubToken) queryParams.set('token', hubToken);
  if (pairingOtp) queryParams.set('otp', pairingOtp);

  const teacherUrl = `http://${activeIp}:${activePort}/?${queryParams.toString()}`;

  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(
    teacherUrl
  )}&bgcolor=ffffff&color=0b1329&margin=8`;

  const handleCopy = () => {
    navigator.clipboard?.writeText(teacherUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="📱 Teacher Android App — Local Wi-Fi Connection"
      size="md"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {/* Banner */}
        <div
          style={{
            backgroundColor: '#0a1122',
            borderRadius: '12px',
            padding: '14px 16px',
            border: '1px solid #1e293b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '10px',
                backgroundColor: '#111d33',
                border: '1px solid #c5a880',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Radio size={22} color="#c5a880" />
            </div>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: '#f8fafc' }}>
                Offline School Wi-Fi Attendance Hub
              </div>
              <div style={{ fontSize: '12px', color: '#94a3b8', lineHeight: 1.4 }}>
                Auto-detects Wi-Fi router. Teachers take attendance with secure 1-time OTP pairing.
              </div>
            </div>
          </div>

          <button
            onClick={loadStatus}
            disabled={isLoading}
            style={{
              backgroundColor: '#1e293b',
              border: '1px solid #334155',
              color: '#cbd5e1',
              padding: '6px 10px',
              borderRadius: '8px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '11px',
              fontWeight: 600,
            }}
            title="Refresh Network Detection"
          >
            <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
            <span>Detect IP</span>
          </button>
        </div>

        {/* Wi-Fi Direct Connection Status Card */}
        <div
          style={{
            backgroundColor: '#070f1e',
            border: '1px solid #1e3a5f',
            borderRadius: '12px',
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <div>
            <div style={{ fontSize: '11px', color: '#10b981', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '5px' }}>
              <Radio size={13} color="#10b981" />
              <span>Instant School Wi-Fi Sync (Zero OTP Required)</span>
            </div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: '#ffffff', fontFamily: 'monospace', marginTop: '3px' }}>
              http://{activeIp}:{activePort}
            </div>
            <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
              Teacher phones on this Wi-Fi connect automatically or via QR scan
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
            <span
              style={{
                fontSize: '11px',
                backgroundColor: '#14532d',
                color: '#86efac',
                padding: '4px 10px',
                borderRadius: '6px',
                fontWeight: 700,
                border: '1px solid #166534',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
              }}
            >
              <ShieldCheck size={13} color="#86efac" />
              <span>Trusted Local Hub</span>
            </span>
          </div>
        </div>

        {/* QR Code Container */}
        <div
          style={{
            backgroundColor: '#ffffff',
            borderRadius: '16px',
            padding: '16px',
            textAlign: 'center',
            border: '2px dashed #c5a880',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
          }}
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              padding: '6px',
              borderRadius: '10px',
              marginBottom: '10px',
            }}
          >
            <img
              src={qrCodeUrl}
              alt="Scan QR code for Teacher App"
              style={{ width: '185px', height: '185px', display: 'block' }}
            />
          </div>
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>
            Scan with Teacher's Phone Camera in App
          </div>
          <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
            Phone and PC must be connected to the same Wi-Fi router
          </div>
        </div>

        {/* IP and Port Adjustment */}
        <div
          style={{
            backgroundColor: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '10px',
            padding: '12px',
          }}
        >
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
            <div style={{ flex: 2 }}>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#64748b', marginBottom: '4px' }}>
                DETECTED PC WI-FI IP:
              </label>
              <input
                type="text"
                value={ipInput}
                onChange={(e) => setIpInput(e.target.value)}
                placeholder="e.g. 192.168.1.50"
                style={{
                  width: '100%',
                  padding: '7px 10px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  fontSize: '13px',
                  fontFamily: 'monospace',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#64748b', marginBottom: '4px' }}>
                PORT:
              </label>
              <input
                type="text"
                value={portInput}
                onChange={(e) => setPortInput(e.target.value)}
                placeholder="5173"
                style={{
                  width: '100%',
                  padding: '7px 10px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  fontSize: '13px',
                  fontFamily: 'monospace',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: '#0a1122',
              borderRadius: '8px',
              padding: '6px 10px',
            }}
          >
            <span
              style={{
                flex: 1,
                fontFamily: 'monospace',
                fontSize: '11px',
                color: '#38bdf8',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {teacherUrl}
            </span>
            <Button variant="outline" size="sm" icon={copied ? Check : Copy} onClick={handleCopy}>
              {copied ? 'Copied!' : 'Copy'}
            </Button>
          </div>
        </div>

        {/* Windows Firewall & Diagnostics Info */}
        <div
          style={{
            backgroundColor: 'rgba(59, 130, 246, 0.06)',
            border: '1px solid rgba(59, 130, 246, 0.25)',
            borderRadius: '10px',
            padding: '10px 14px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '10px',
          }}
        >
          <ShieldCheck size={18} color="#2563eb" style={{ flexShrink: 0, marginTop: '2px' }} />
          <div style={{ fontSize: '12px', color: '#1e3a8a', lineHeight: 1.45 }}>
            <strong>Windows Defender Firewall:</strong> Ensure that Windows Firewall allows <em>SMS - Student Management System</em> on <strong>Private Networks</strong>. If your phone cannot connect, check that both devices are on the same Wi-Fi and not separated by a guest network isolation rule.
          </div>
        </div>

        {/* Footer Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button variant="primary" icon={ExternalLink} onClick={() => window.open(teacherUrl, '_blank')}>
            Open on this PC
          </Button>
        </div>
      </div>
    </Modal>
  );
}
