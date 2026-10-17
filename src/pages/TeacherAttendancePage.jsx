import React, { useState, useEffect, useMemo } from 'react';
import {
  Users,
  CheckCircle2,
  XCircle,
  Clock,
  Wifi,
  WifiOff,
  Settings,
  RefreshCw,
  Search,
  CheckCheck,
  Save,
  Calendar,
  AlertCircle,
  ChevronRight,
  ShieldCheck,
  Smartphone,
  School,
  Sparkles,
} from 'lucide-react';
import {
  getStoredHubUrl,
  setStoredHubUrl,
  checkHubConnection,
  fetchBatchesFromHub,
  fetchStudentsFromHub,
  submitAttendanceToHub,
} from '../lib/localWifiHubService';
import { useAcademySettings } from '../lib/academySettings';

export default function TeacherAttendancePage() {
  const academySettings = useAcademySettings();
  const [hubUrl, setHubUrl] = useState(getStoredHubUrl());
  const [isConnected, setIsConnected] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [urlInput, setUrlInput] = useState(hubUrl);

  const [batches, setBatches] = useState([]);
  const [selectedBatchId, setSelectedBatchId] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [students, setStudents] = useState([]);
  const [attendanceMap, setAttendanceMap] = useState({});
  const [remarksMap, setRemarksMap] = useState({});

  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 4500);
  };

  // 1. Check connection with School PC on load
  const verifyConnection = async (targetUrl = hubUrl) => {
    setIsChecking(true);
    setErrorMessage('');
    const res = await checkHubConnection(targetUrl);
    setIsChecking(false);
    setIsConnected(res.ok);
    if (!res.ok) {
      setErrorMessage(`Cannot connect to School PC at ${targetUrl}. Please ensure your phone is on School Wi-Fi.`);
    } else {
      loadBatches(targetUrl);
    }
  };

  useEffect(() => {
    verifyConnection(hubUrl);
  }, []);

  // 2. Load Batches from School PC
  const loadBatches = async (targetUrl = hubUrl) => {
    const list = await fetchBatchesFromHub(targetUrl);
    setBatches(list);
    if (list.length > 0 && !selectedBatchId) {
      setSelectedBatchId(list[0].id);
    }
  };

  // 3. Load Students whenever Batch changes
  useEffect(() => {
    if (!selectedBatchId) return;

    let isMounted = true;
    const loadStudents = async () => {
      setIsLoading(true);
      const studentList = await fetchStudentsFromHub(selectedBatchId, hubUrl);
      if (!isMounted) return;

      setStudents(studentList);

      // Default attendance: everyone Present for quick morning workflow
      const initialMap = {};
      studentList.forEach((s) => {
        initialMap[s.id] = 'Present';
      });
      setAttendanceMap(initialMap);
      setIsLoading(false);
    };

    loadStudents();
    return () => {
      isMounted = false;
    };
  }, [selectedBatchId, hubUrl]);

  // Handle single student status toggle
  const setStudentStatus = (studentId, status) => {
    setAttendanceMap((prev) => ({
      ...prev,
      [studentId]: status,
    }));
  };

  // Quick Action: Mark All Present
  const markAllPresent = () => {
    const updated = {};
    students.forEach((s) => {
      updated[s.id] = 'Present';
    });
    setAttendanceMap(updated);
    showToast('All students marked Present');
  };

  // Quick Action: Mark All Absent
  const markAllAbsent = () => {
    const updated = {};
    students.forEach((s) => {
      updated[s.id] = 'Absent';
    });
    setAttendanceMap(updated);
    showToast('All students marked Absent');
  };

  // Metrics calculation
  const totalCount = students.length;
  const presentCount = useMemo(() => {
    return Object.values(attendanceMap).filter((st) => st === 'Present').length;
  }, [attendanceMap]);

  const absentCount = useMemo(() => {
    return Object.values(attendanceMap).filter((st) => st === 'Absent').length;
  }, [attendanceMap]);

  const lateCount = useMemo(() => {
    return Object.values(attendanceMap).filter((st) => st === 'Late').length;
  }, [attendanceMap]);

  const rate = totalCount > 0 ? Math.round(((presentCount + lateCount) / totalCount) * 100) : 100;

  // Filter students by search term
  const filteredStudents = useMemo(() => {
    if (!searchTerm.trim()) return students;
    const term = searchTerm.toLowerCase();
    return students.filter(
      (s) =>
        s.full_name?.toLowerCase().includes(term) ||
        String(s.roll_no || '').includes(term) ||
        s.admission_no?.toLowerCase().includes(term)
    );
  }, [students, searchTerm]);

  // Submit attendance to School PC
  const handleSubmit = async () => {
    if (!selectedBatchId || students.length === 0) return;

    setIsSubmitting(true);
    const records = students.map((s) => ({
      student_id: s.id,
      status: attendanceMap[s.id] || 'Present',
      remarks: remarksMap[s.id] || '',
    }));

    const res = await submitAttendanceToHub(selectedBatchId, selectedDate, records, hubUrl);
    setIsSubmitting(false);

    if (res.ok) {
      showToast(`✓ Saved! ${presentCount} Present, ${absentCount} Absent recorded on School PC.`);
    } else if (res.queued) {
      showToast('⚠️ Wi-Fi dropped. Saved on phone storage & will sync automatically.');
    } else {
      alert('Error saving attendance: ' + (res.error || 'Connection failed'));
    }
  };

  // Save new School PC URL in settings
  const handleSaveSettings = () => {
    setStoredHubUrl(urlInput);
    setHubUrl(urlInput);
    setShowSettingsModal(false);
    verifyConnection(urlInput);
  };

  const activeBatch = batches.find((b) => b.id === selectedBatchId) || batches[0] || {};

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#070e19',
      color: '#f8fafc',
      fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      paddingBottom: '90px',
    }}>
      {/* Toast Banner */}
      {toastMessage && (
        <div style={{
          position: 'fixed',
          top: '16px',
          left: '16px',
          right: '16px',
          zIndex: 9999,
          backgroundColor: '#10b981',
          color: '#ffffff',
          padding: '12px 18px',
          borderRadius: '12px',
          fontSize: '14px',
          fontWeight: 600,
          boxShadow: '0 10px 25px rgba(16, 185, 129, 0.4)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
        }}>
          <CheckCircle2 size={20} />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Mobile App Header */}
      <header style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        backgroundColor: '#0a1424',
        borderBottom: '1px solid #1f3250',
        padding: '14px 16px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              backgroundColor: '#0f1c32',
              border: '1px solid #c5a880',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
            }}>
              {academySettings.logo ? (
                <img src={academySettings.logo} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <School size={20} color="#c5a880" />
              )}
            </div>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: '#ffffff' }}>
                {academySettings.academy_name || 'SMS Academy'}
              </div>
              <div style={{ fontSize: '11px', color: '#94a3b8' }}>Teacher Attendance App</div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={() => verifyConnection()}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#94a3b8',
                padding: '6px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
              }}
              title="Refresh Connection"
            >
              <RefreshCw size={18} className={isChecking ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={() => {
                setUrlInput(hubUrl);
                setShowSettingsModal(true);
              }}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#c5a880',
                padding: '6px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
              }}
              title="Configure School PC Connection"
            >
              <Settings size={20} />
            </button>
          </div>
        </div>

        {/* Connection Status Pill */}
        <div style={{
          marginTop: '10px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 12px',
          borderRadius: '8px',
          backgroundColor: isConnected ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
          border: `1px solid ${isConnected ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {isConnected ? <Wifi size={14} color="#10b981" /> : <WifiOff size={14} color="#ef4444" />}
            <span style={{ fontSize: '12px', fontWeight: 600, color: isConnected ? '#10b981' : '#ef4444' }}>
              {isConnected ? 'Wi-Fi Connected to School PC' : 'Offline / School PC Disconnected'}
            </span>
          </div>
          <span style={{ fontSize: '11px', color: '#94a3b8' }}>
            {hubUrl.replace(/^https?:\/\//, '')}
          </span>
        </div>
      </header>

      {/* Main Container */}
      <main style={{ padding: '16px' }}>
        {/* Error Notice if Disconnected */}
        {errorMessage && (
          <div style={{
            backgroundColor: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid #ef4444',
            borderRadius: '12px',
            padding: '12px 14px',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '10px',
          }}>
            <AlertCircle size={20} color="#ef4444" style={{ flexShrink: 0, marginTop: '2px' }} />
            <div style={{ fontSize: '12px', color: '#fecaca', lineHeight: 1.4 }}>
              <strong>Not Connected to School PC:</strong> {errorMessage}
              <div style={{ marginTop: '6px' }}>
                <button
                  onClick={() => setShowSettingsModal(true)}
                  style={{
                    backgroundColor: '#ef4444',
                    color: '#ffffff',
                    border: 'none',
                    padding: '4px 10px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Change School PC IP
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Cohort / Batch Selector */}
        <div style={{ marginBottom: '14px' }}>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#94a3b8', marginBottom: '6px' }}>
            SELECT CLASS / BATCH:
          </label>
          <div style={{
            display: 'flex',
            gap: '8px',
            overflowX: 'auto',
            paddingBottom: '4px',
            scrollbarWidth: 'none',
          }}>
            {batches.map((b) => {
              const active = b.id === selectedBatchId;
              return (
                <button
                  key={b.id}
                  onClick={() => setSelectedBatchId(b.id)}
                  style={{
                    flexShrink: 0,
                    padding: '8px 14px',
                    borderRadius: '10px',
                    fontSize: '13px',
                    fontWeight: 600,
                    backgroundColor: active ? '#c5a880' : '#0f1c32',
                    color: active ? '#070e19' : '#cbd5e1',
                    border: `1px solid ${active ? '#c5a880' : '#1f3250'}`,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {b.name}
                </button>
              );
            })}
          </div>
        </div>

        {/* Date Selector Row */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: '#0f1c32',
          border: '1px solid #1f3250',
          borderRadius: '12px',
          padding: '10px 14px',
          marginBottom: '14px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Calendar size={18} color="#c5a880" />
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#e2e8f0' }}>Roll Call Date:</span>
          </div>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            style={{
              backgroundColor: '#070e19',
              border: '1px solid #1f3250',
              borderRadius: '8px',
              color: '#ffffff',
              padding: '6px 10px',
              fontSize: '13px',
              outline: 'none',
            }}
          />
        </div>

        {/* Live Metrics Summary Card */}
        <div style={{
          backgroundColor: '#0f1c32',
          border: '1px solid #1f3250',
          borderRadius: '14px',
          padding: '14px',
          marginBottom: '16px',
          boxShadow: '0 4px 15px rgba(0, 0, 0, 0.2)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#f1f5f9' }}>
              {activeBatch.name || 'Batch Roster'}
            </span>
            <span style={{
              fontSize: '12px',
              fontWeight: 700,
              padding: '2px 8px',
              borderRadius: '6px',
              backgroundColor: rate >= 75 ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
              color: rate >= 75 ? '#34d399' : '#f87171',
            }}>
              {rate}% Attendance
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', textAlign: 'center' }}>
            <div style={{ backgroundColor: '#070e19', padding: '8px 4px', borderRadius: '10px', border: '1px solid #1f3250' }}>
              <div style={{ fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase' }}>Total</div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: '#f8fafc' }}>{totalCount}</div>
            </div>
            <div style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', padding: '8px 4px', borderRadius: '10px', border: '1px solid rgba(16, 185, 129, 0.25)' }}>
              <div style={{ fontSize: '10px', color: '#34d399', textTransform: 'uppercase' }}>Present</div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: '#10b981' }}>{presentCount}</div>
            </div>
            <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', padding: '8px 4px', borderRadius: '10px', border: '1px solid rgba(239, 68, 68, 0.25)' }}>
              <div style={{ fontSize: '10px', color: '#f87171', textTransform: 'uppercase' }}>Absent</div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: '#ef4444' }}>{absentCount}</div>
            </div>
            <div style={{ backgroundColor: 'rgba(245, 158, 11, 0.1)', padding: '8px 4px', borderRadius: '10px', border: '1px solid rgba(245, 158, 11, 0.25)' }}>
              <div style={{ fontSize: '10px', color: '#fbbf24', textTransform: 'uppercase' }}>Late</div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: '#f59e0b' }}>{lateCount}</div>
            </div>
          </div>

          {/* Quick Actions Row */}
          <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
            <button
              onClick={markAllPresent}
              style={{
                flex: 1,
                backgroundColor: 'rgba(16, 185, 129, 0.15)',
                color: '#34d399',
                border: '1px solid rgba(16, 185, 129, 0.4)',
                borderRadius: '8px',
                padding: '7px 10px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
              }}
            >
              <CheckCheck size={14} />
              All Present
            </button>
            <button
              onClick={markAllAbsent}
              style={{
                flex: 1,
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                color: '#f87171',
                border: '1px solid rgba(239, 68, 68, 0.4)',
                borderRadius: '8px',
                padding: '7px 10px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
              }}
            >
              <XCircle size={14} />
              All Absent
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div style={{
          position: 'relative',
          marginBottom: '14px',
        }}>
          <Search size={16} color="#94a3b8" style={{ position: 'absolute', left: '12px', top: '12px' }} />
          <input
            type="text"
            placeholder="Search by student name or roll number..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: '100%',
              backgroundColor: '#0f1c32',
              border: '1px solid #1f3250',
              borderRadius: '10px',
              padding: '10px 12px 10px 36px',
              color: '#ffffff',
              fontSize: '13px',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Students List */}
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8' }}>
            <RefreshCw size={28} className="animate-spin" style={{ margin: '0 auto 10px auto' }} />
            <div>Loading students from School PC...</div>
          </div>
        ) : filteredStudents.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8' }}>
            No students found matching your criteria.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {filteredStudents.map((s, index) => {
              const currentStatus = attendanceMap[s.id] || 'Present';
              return (
                <div
                  key={s.id}
                  style={{
                    backgroundColor: '#0f1c32',
                    border: `1px solid ${currentStatus === 'Present' ? '#10b981' : currentStatus === 'Absent' ? '#ef4444' : '#1f3250'}`,
                    borderRadius: '12px',
                    padding: '12px 14px',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '8px',
                        backgroundColor: '#070e19',
                        border: '1px solid #1f3250',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 800,
                        fontSize: '13px',
                        color: '#c5a880',
                      }}>
                        #{s.roll_no || index + 1}
                      </div>
                      <div>
                        <div style={{ fontSize: '14px', fontWeight: 700, color: '#f8fafc' }}>
                          {s.full_name}
                        </div>
                        <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                          Adm: {s.admission_no} • {s.gender || 'Student'}
                        </div>
                      </div>
                    </div>

                    <span style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      padding: '3px 8px',
                      borderRadius: '6px',
                      backgroundColor: currentStatus === 'Present' ? '#10b981' : currentStatus === 'Absent' ? '#ef4444' : '#f59e0b',
                      color: '#ffffff',
                    }}>
                      {currentStatus.toUpperCase()}
                    </span>
                  </div>

                  {/* 3 Status Buttons */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                    <button
                      onClick={() => setStudentStatus(s.id, 'Present')}
                      style={{
                        padding: '8px 0',
                        borderRadius: '8px',
                        fontSize: '12px',
                        fontWeight: 700,
                        backgroundColor: currentStatus === 'Present' ? '#10b981' : '#070e19',
                        color: currentStatus === 'Present' ? '#ffffff' : '#94a3b8',
                        border: `1px solid ${currentStatus === 'Present' ? '#10b981' : '#1f3250'}`,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '4px',
                      }}
                    >
                      <CheckCircle2 size={14} />
                      Present
                    </button>
                    <button
                      onClick={() => setStudentStatus(s.id, 'Absent')}
                      style={{
                        padding: '8px 0',
                        borderRadius: '8px',
                        fontSize: '12px',
                        fontWeight: 700,
                        backgroundColor: currentStatus === 'Absent' ? '#ef4444' : '#070e19',
                        color: currentStatus === 'Absent' ? '#ffffff' : '#94a3b8',
                        border: `1px solid ${currentStatus === 'Absent' ? '#ef4444' : '#1f3250'}`,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '4px',
                      }}
                    >
                      <XCircle size={14} />
                      Absent
                    </button>
                    <button
                      onClick={() => setStudentStatus(s.id, 'Late')}
                      style={{
                        padding: '8px 0',
                        borderRadius: '8px',
                        fontSize: '12px',
                        fontWeight: 700,
                        backgroundColor: currentStatus === 'Late' ? '#f59e0b' : '#070e19',
                        color: currentStatus === 'Late' ? '#ffffff' : '#94a3b8',
                        border: `1px solid ${currentStatus === 'Late' ? '#f59e0b' : '#1f3250'}`,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '4px',
                      }}
                    >
                      <Clock size={14} />
                      Late
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Sticky Bottom Submit Button */}
      <div style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: '#0a1424',
        borderTop: '1px solid #1f3250',
        padding: '12px 16px',
        boxShadow: '0 -4px 20px rgba(0, 0, 0, 0.4)',
        zIndex: 40,
      }}>
        <button
          onClick={handleSubmit}
          disabled={isSubmitting || students.length === 0}
          style={{
            width: '100%',
            backgroundColor: isConnected ? '#10b981' : '#f59e0b',
            color: '#ffffff',
            border: 'none',
            borderRadius: '12px',
            padding: '14px',
            fontSize: '15px',
            fontWeight: 700,
            cursor: isSubmitting ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            boxShadow: isConnected ? '0 4px 15px rgba(16, 185, 129, 0.4)' : '0 4px 15px rgba(245, 158, 11, 0.4)',
          }}
        >
          {isSubmitting ? (
            <>
              <RefreshCw size={18} className="animate-spin" />
              Saving to School PC...
            </>
          ) : (
            <>
              <Save size={18} />
              Save Attendance to School PC ({presentCount} Present, {absentCount} Absent)
            </>
          )}
        </button>
      </div>

      {/* Settings Modal (Change School PC IP) */}
      {showSettingsModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.7)',
          zIndex: 999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px',
        }}>
          <div style={{
            backgroundColor: '#0f1c32',
            border: '1px solid #1f3250',
            borderRadius: '16px',
            padding: '24px',
            maxWidth: '400px',
            width: '100%',
            boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
          }}>
            <h3 style={{ margin: '0 0 10px 0', fontSize: '18px', fontWeight: 700, color: '#f8fafc' }}>
              Connect to School PC
            </h3>
            <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: '#94a3b8', lineHeight: 1.5 }}>
              Enter the local Wi-Fi address of the School PC running SMS (shown on the school computer screen).
            </p>

            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#cbd5e1', marginBottom: '6px' }}>
              SCHOOL PC WI-FI URL:
            </label>
            <input
              type="text"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="e.g. http://10.102.139.146:5173"
              style={{
                width: '100%',
                backgroundColor: '#070e19',
                border: '1px solid #1f3250',
                borderRadius: '8px',
                padding: '10px 12px',
                color: '#ffffff',
                fontSize: '14px',
                outline: 'none',
                marginBottom: '16px',
                boxSizing: 'border-box',
              }}
            />

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => setShowSettingsModal(false)}
                style={{
                  flex: 1,
                  backgroundColor: 'transparent',
                  border: '1px solid #1f3250',
                  color: '#94a3b8',
                  borderRadius: '8px',
                  padding: '10px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveSettings}
                style={{
                  flex: 1,
                  backgroundColor: '#c5a880',
                  border: 'none',
                  color: '#070e19',
                  borderRadius: '8px',
                  padding: '10px',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Connect Now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
