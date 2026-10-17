import React, { useState, useEffect } from 'react';
import {
  Smartphone,
  Wifi,
  Copy,
  Check,
  ExternalLink,
  ShieldCheck,
  RefreshCw,
  QrCode,
  X,
  Radio,
  CheckCircle2,
} from 'lucide-react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import { checkHubConnection } from '../../lib/localWifiHubService';

export default function TeacherAppConnectModal({ isOpen, onClose }) {
  const [copied, setCopied] = useState(false);
  const [hubStatus, setHubStatus] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // Auto-detect IP from hub API
  useEffect(() => {
    if (isOpen) {
      loadStatus();
    }
  }, [isOpen]);

  const loadStatus = async () => {
    setIsLoading(true);
    const res = await checkHubConnection();
    setIsLoading(false);
    if (res.ok && res.data) {
      setHubStatus(res.data);
    }
  };

  const detectedIp = hubStatus?.localIp || '10.102.139.146';
  const port = hubStatus?.port || 5173;
  const teacherUrl = `http://${detectedIp}:${port}/?portal=teacher`;
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(teacherUrl)}&bgcolor=ffffff&color=0a1424&margin=6`;

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
      <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
        {/* Banner */}
        <div style={{
          backgroundColor: '#0a1424',
          borderRadius: '12px',
          padding: '16px',
          border: '1px solid #1f3250',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
        }}>
          <div style={{
            width: '44px',
            height: '44px',
            borderRadius: '12px',
            backgroundColor: '#0f1c32',
            border: '1px solid #c5a880',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}>
            <Radio size={24} color="#c5a880" />
          </div>
          <div>
            <div style={{ fontSize: '15px', fontWeight: 700, color: '#f8fafc' }}>
              Offline School Wi-Fi Attendance Hub
            </div>
            <div style={{ fontSize: '12px', color: '#94a3b8', lineHeight: 1.4 }}>
              Teachers can take attendance on their phone without internet. Data syncs directly into this PC!
            </div>
          </div>
        </div>

        {/* QR Code Container */}
        <div style={{
          backgroundColor: '#f8fafc',
          borderRadius: '16px',
          padding: '20px',
          textAlign: 'center',
          border: '2px dashed #c5a880',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <div style={{
            backgroundColor: '#ffffff',
            padding: '10px',
            borderRadius: '12px',
            boxShadow: '0 4px 15px rgba(0,0,0,0.1)',
            marginBottom: '10px',
          }}>
            <img
              src={qrCodeUrl}
              alt="Scan QR code for Teacher App"
              style={{ width: '180px', height: '180px', display: 'block' }}
            />
          </div>
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>
            Scan with Teacher's Phone Camera
          </div>
          <div style={{ fontSize: '11px', color: '#64748b' }}>
            Phone must be connected to this School Wi-Fi
          </div>
        </div>

        {/* Connection URL Box */}
        <div>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#94a3b8', marginBottom: '6px' }}>
            LOCAL WI-FI CONNECTION URL:
          </label>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: '#070e19',
            border: '1px solid #1f3250',
            borderRadius: '10px',
            padding: '6px 10px',
          }}>
            <span style={{
              flex: 1,
              fontFamily: 'monospace',
              fontSize: '13px',
              color: '#38bdf8',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {teacherUrl}
            </span>
            <Button
              variant="outline"
              size="sm"
              icon={copied ? Check : Copy}
              onClick={handleCopy}
              style={{ flexShrink: 0 }}
            >
              {copied ? 'Copied!' : 'Copy'}
            </Button>
          </div>
        </div>

        {/* Step-by-Step Instructions */}
        <div style={{
          backgroundColor: 'rgba(197, 168, 128, 0.08)',
          border: '1px solid rgba(197, 168, 128, 0.25)',
          borderRadius: '12px',
          padding: '14px',
        }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#c5a880', marginBottom: '8px' }}>
            QUICK 3-STEP SETUP FOR TEACHERS:
          </div>
          <ol style={{ margin: 0, paddingLeft: '18px', fontSize: '12px', color: '#cbd5e1', lineHeight: 1.6 }}>
            <li>Connect the Android phone to the <strong>same Wi-Fi router</strong> as this computer.</li>
            <li>Scan the QR code above or open the <strong>SMS Teacher Attendance APK</strong>.</li>
            <li>Select class and mark Present / Absent. Records appear on this computer in real-time!</li>
          </ol>
        </div>

        {/* Footer Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button
            variant="primary"
            icon={ExternalLink}
            onClick={() => window.open(teacherUrl, '_blank')}
          >
            Open Teacher Portal on this PC
          </Button>
        </div>
      </div>
    </Modal>
  );
}
