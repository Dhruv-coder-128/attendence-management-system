import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Clock, GripVertical, ShieldAlert } from 'lucide-react';
import { getStoredLicense } from '../../lib/licenseService';

const STORAGE_POS_KEY = 'sms_capsule_pos';

/**
 * Draggable Floating Trial Countdown Capsule
 * Features:
 * - Second-by-second live countdown (Days, Hours, Minutes, Seconds)
 * - Pulsing / blinking red live indicator dot
 * - 100% draggable with mouse/touch support, boundary clamping & localStorage persistence
 * - Compact pill format with dark glassmorphism
 * - Click-to-activate trigger
 */
export default function DraggableTrialCapsule({ daysRemaining, onOpenActivation }) {
  const license = getStoredLicense();
  const schoolName = license?.schoolName || 'SMS Trial';

  // Compute target trial expiration time
  const targetTimeRef = useRef(null);
  if (!targetTimeRef.current) {
    if (license?.trialEndsAt) {
      targetTimeRef.current = new Date(license.trialEndsAt).getTime();
    } else {
      const days = daysRemaining !== undefined ? daysRemaining : license?.daysRemaining ?? 30;
      targetTimeRef.current = Date.now() + days * 24 * 60 * 60 * 1000;
    }
  }

  // Live countdown state
  const [timeLeft, setTimeLeft] = useState({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
    isExpired: false,
  });

  useEffect(() => {
    const updateCountdown = () => {
      const now = Date.now();
      const diffMs = Math.max(0, targetTimeRef.current - now);

      if (diffMs <= 0) {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0, isExpired: true });
        return;
      }

      const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diffMs / (1000 * 60 * 60)) % 24);
      const minutes = Math.floor((diffMs / (1000 * 60)) % 60);
      const seconds = Math.floor((diffMs / 1000) % 60);

      setTimeLeft({ days, hours, minutes, seconds, isExpired: false });
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, []);

  // Draggable position state
  const [position, setPosition] = useState(() => {
    if (typeof window === 'undefined') return { x: 20, y: 16 };
    try {
      const saved = localStorage.getItem(STORAGE_POS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.x === 'number' && typeof parsed.y === 'number') {
          return parsed;
        }
      }
    } catch {
      // Fallback
    }
    // Default top-right position
    const initX = Math.max(20, (window.innerWidth || 1200) - 270);
    return { x: initX, y: 14 };
  });

  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ mouseX: 0, mouseY: 0, posX: 0, posY: 0, hasMoved: false });
  const capsuleRef = useRef(null);

  // Pointer down handler
  const handlePointerDown = (e) => {
    if (e.button !== undefined && e.button !== 0) return; // Only primary mouse button
    setIsDragging(true);
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      posX: position.x,
      posY: position.y,
      hasMoved: false,
    };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  // Pointer move handler
  const handlePointerMove = useCallback((e) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartRef.current.mouseX;
    const dy = e.clientY - dragStartRef.current.mouseY;

    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      dragStartRef.current.hasMoved = true;
    }

    const width = capsuleRef.current?.offsetWidth || 230;
    const height = capsuleRef.current?.offsetHeight || 34;

    const maxX = Math.max(0, (window.innerWidth || 1200) - width - 10);
    const maxY = Math.max(0, (window.innerHeight || 800) - height - 10);

    const newX = Math.min(Math.max(10, dragStartRef.current.posX + dx), maxX);
    const newY = Math.min(Math.max(10, dragStartRef.current.posY + dy), maxY);

    setPosition({ x: newX, y: newY });
  }, [isDragging]);

  // Pointer up handler
  const handlePointerUp = useCallback((e) => {
    if (!isDragging) return;
    setIsDragging(false);

    try {
      e.currentTarget.releasePointerCapture?.(e.pointerId);
    } catch {
      // Ignore
    }

    if (dragStartRef.current.hasMoved) {
      // Save new coordinates
      try {
        localStorage.setItem(STORAGE_POS_KEY, JSON.stringify(position));
      } catch {
        // Ignore
      }
    } else {
      // It was a click! Open activation modal
      if (onOpenActivation) {
        onOpenActivation();
      }
    }
  }, [isDragging, position, onOpenActivation]);

  const isLowTime = timeLeft.days <= 3;

  return (
    <>
      <style>{`
        @keyframes liveRedDotBlink {
          0%, 100% {
            opacity: 1;
            transform: scale(1);
            box-shadow: 0 0 8px #ef4444, 0 0 12px rgba(239, 68, 68, 0.7);
          }
          50% {
            opacity: 0.25;
            transform: scale(0.8);
            box-shadow: 0 0 2px #ef4444;
          }
        }
        .sms-trial-capsule {
          user-select: none;
          touch-action: none;
          transition: border-color 0.15s ease, box-shadow 0.15s ease;
        }
        .sms-trial-capsule:hover {
          border-color: rgba(239, 68, 68, 0.8) !important;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45), 0 0 14px rgba(239, 68, 68, 0.25) !important;
        }
      `}</style>

      <div
        ref={capsuleRef}
        className="sms-trial-capsule"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        title="Draggable Trial Timer • Click to view license details or activate. Drag to move anywhere."
        style={{
          position: 'fixed',
          left: `${position.x}px`,
          top: `${position.y}px`,
          zIndex: 99999,
          cursor: isDragging ? 'grabbing' : 'grab',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          padding: '5px 12px 5px 9px',
          borderRadius: '9999px',
          background: isLowTime
            ? 'linear-gradient(135deg, rgba(30, 10, 10, 0.94) 0%, rgba(15, 23, 42, 0.94) 100%)'
            : 'rgba(15, 23, 42, 0.90)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          border: `1.5px solid ${isLowTime ? 'rgba(239, 68, 68, 0.7)' : 'rgba(239, 68, 68, 0.4)'}`,
          boxShadow: isLowTime
            ? '0 6px 20px rgba(0, 0, 0, 0.4), 0 0 12px rgba(239, 68, 68, 0.3)'
            : '0 4px 18px rgba(0, 0, 0, 0.35)',
          color: '#ffffff',
          fontSize: '12px',
          fontFamily: 'var(--font-sans, system-ui, sans-serif)',
          whiteSpace: 'nowrap',
        }}
      >
        {/* Subtle Drag Grip Handle */}
        <GripVertical
          size={13}
          style={{
            color: 'rgba(255, 255, 255, 0.4)',
            cursor: isDragging ? 'grabbing' : 'grab',
            flexShrink: 0,
            marginLeft: '-2px',
          }}
        />

        {/* Live Blinking Red Tick / Dot */}
        <span
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: '#ef4444',
            display: 'inline-block',
            animation: 'liveRedDotBlink 1.2s infinite ease-in-out',
            flexShrink: 0,
          }}
        />

        {/* Live Second-by-Second Countdown Display */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 500 }}>
            Trial:
          </span>
          <span
            style={{
              fontVariantNumeric: 'tabular-nums',
              fontWeight: 700,
              fontSize: '12px',
              letterSpacing: '0.2px',
              color: isLowTime ? '#fca5a5' : '#ffffff',
            }}
          >
            {timeLeft.isExpired ? (
              <span style={{ color: '#ef4444' }}>Trial Expired</span>
            ) : (
              `${timeLeft.days}d ${String(timeLeft.hours).padStart(2, '0')}h ${String(timeLeft.minutes).padStart(2, '0')}m ${String(timeLeft.seconds).padStart(2, '0')}s`
            )}
          </span>
        </div>
      </div>
    </>
  );
}
