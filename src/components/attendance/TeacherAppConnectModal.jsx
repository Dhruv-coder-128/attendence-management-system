import React, { useState, useEffect } from 'react';
import {
  Copy,
  Check,
  ExternalLink,
  Radio,
} from 'lucide-react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import { checkHubConnection } from '../../lib/localWifiHubService';

export default function TeacherAppConnectModal({ isOpen, onClose }) {
  const [copied, setCopied] = useState(false);
  const [ipInput, setIpInput] = useState('192.168.0.104');
  const [portInput, setPortInput] = useState('5173');
  const [, setIsLoading] = useState(false);
  const [, setHubStatus] = useState(null);

  const loadStatus = React.useCallback(async () => {
    setIsLoading(true);
    const res = await checkHubConnection();
    setIsLoading(false);
    if (res.ok && res.data) {
      setHubStatus(res.data);
      if (res.data.localIp) {
        setIpInput(res.data.localIp);
      }
      if (res.data.port) {
        setPortInput(String(res.data.port));
      }
    }
  }, []);

  // Auto-detect IP from hub API
  useEffect(() => {
    if (isOpen) {
      loadStatus();
    }
  }, [isOpen, loadStatus]);

  const activeIp = ipInput.trim() || '192.168.0.104';
  const activePort = portInput.trim() || '5173';
  const teacherUrl = `http://${activeIp}:${activePort}/?portal=teacher`;
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Banner */}
        <div
          style={{
            backgroundColor: '#0a1122',
            borderRadius: '12px',
            padding: '14px 16px',
            border: '1px solid #1e293b',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}
        >
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
              Teachers take attendance on their phone. Data syncs directly into this computer in real-time!
            </div>
          </div>
        </div>

        {/* QR Code Container */}
        <div
          style={{
            backgroundColor: '#ffffff',
            borderRadius: '16px',
            padding: '18px',
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
              style={{ width: '190px', height: '190px', display: 'block' }}
            />
          </div>
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>
            Scan with Teacher's Phone Camera
          </div>
          <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
            Phone must be connected to the same School Wi-Fi network
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
                ACTIVE WI-FI IP:
              </label>
              <input
                type="text"
                value={ipInput}
                onChange={(e) => setIpInput(e.target.value)}
                placeholder="e.g. 192.168.0.104"
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
                fontSize: '12px',
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

        {/* Step-by-Step Instructions */}
        <div
          style={{
            backgroundColor: 'rgba(197, 168, 128, 0.08)',
            border: '1px solid rgba(197, 168, 128, 0.25)',
            borderRadius: '10px',
            padding: '12px 14px',
          }}
        >
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#c5a880', marginBottom: '6px' }}>
            QUICK 3-STEP SETUP FOR TEACHERS:
          </div>
          <ol style={{ margin: 0, paddingLeft: '16px', fontSize: '12px', color: '#334155', lineHeight: 1.5 }}>
            <li>Connect the Android phone to the <strong>same Wi-Fi router</strong> as this computer.</li>
            <li>In the phone app, tap <strong>"📷 Scan QR Code"</strong> and scan the code above.</li>
            <li>Select your class, mark Present/Absent, and tap Done!</li>
          </ol>
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
