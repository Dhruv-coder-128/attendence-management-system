import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  CheckCircle2,
  XCircle,
  Settings,
  RefreshCw,
  Search,
  CheckCheck,
  Calendar,
  AlertCircle,
  School,
  Check,
} from 'lucide-react';
import {
  getStoredHubUrl,
  setStoredHubUrl,
  checkHubConnection,
  fetchBatchesFromHub,
  fetchStudentsFromHub,
  submitAttendanceToHub,
  DEFAULT_SCHOOL_PC_URL,
} from '../lib/localWifiHubService';
import { useAcademySettings } from '../lib/academySettings';

export default function TeacherAttendancePage() {
  const academySettings = useAcademySettings();
  const [hubUrl, setHubUrl] = useState(getStoredHubUrl());
  const [isConnected, setIsConnected] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [savedSummary, setSavedSummary] = useState(null);
  const [urlInput, setUrlInput] = useState(hubUrl);

  const [batches, setBatches] = useState([]);
  const [selectedBatchId, setSelectedBatchId] = useState('');
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [students, setStudents] = useState([]);
  const [attendanceMap, setAttendanceMap] = useState({});

  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 4000);
  };

  // 1. Verify connection with the School PC over Wi-Fi
  const verifyConnection = async (targetUrl = hubUrl) => {
    setIsChecking(true);
    setErrorMessage('');
    const res = await checkHubConnection(targetUrl);
    setIsChecking(false);
    setIsConnected(res.ok);
    if (!res.ok) {
      setErrorMessage(`Cannot reach School PC at ${targetUrl}. Make sure your phone is connected to the same School Wi-Fi.`);
    } else {
      loadBatches(targetUrl);
    }
  };

  useEffect(() => {
    verifyConnection(hubUrl);
  }, []);

  // 2. Load Cohort Batches from School PC
  const loadBatches = async (targetUrl = hubUrl) => {
    const list = await fetchBatchesFromHub(targetUrl);
    setBatches(list);
    if (list.length > 0 && !selectedBatchId) {
      setSelectedBatchId(list[0].id);
    }
  };

  // 3. Load Students for active batch
  useEffect(() => {
    if (!selectedBatchId) return;

    let isMounted = true;
    const loadStudents = async () => {
      setIsLoading(true);
      const studentList = await fetchStudentsFromHub(selectedBatchId, hubUrl);
      if (!isMounted) return;

      setStudents(studentList);

      // Default: Everyone is marked Present for fastest classroom workflow
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

  // Handle single student toggle (Present / Absent)
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
    showToast('✓ All students marked Present');
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

  // Metric computations
  const totalCount = students.length;
  const presentCount = useMemo(() => {
    return Object.values(attendanceMap).filter((st) => st === 'Present').length;
  }, [attendanceMap]);

  const absentCount = useMemo(() => {
    return Object.values(attendanceMap).filter((st) => st === 'Absent').length;
  }, [attendanceMap]);

  const attendancePercentage = totalCount > 0 ? Math.round((presentCount / totalCount) * 100) : 100;

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

  // Submit attendance to School PC (The "DONE" action)
  const handleSubmit = async () => {
    if (!selectedBatchId || students.length === 0) return;

    setIsSubmitting(true);
    const records = students.map((s) => ({
      student_id: s.id,
      status: attendanceMap[s.id] || 'Present',
      remarks: '',
    }));

    const res = await submitAttendanceToHub(selectedBatchId, selectedDate, records, hubUrl);
    setIsSubmitting(false);

    if (res.ok) {
      setSavedSummary({
        batchName: activeBatch.name || 'Current Class',
        date: selectedDate,
        total: totalCount,
        present: presentCount,
        absent: absentCount,
      });
      setShowSuccessModal(true);
    } else if (res.queued) {
      showToast('⚠️ Wi-Fi dropped. Saved to phone and will auto-sync when Wi-Fi connects.');
    } else {
      alert('Error saving attendance: ' + (res.error || 'Connection failed'));
    }
  };

  // Save new School PC URL in settings
  const handleSaveSettings = () => {
    const clean = urlInput.trim().replace(/\/+$/, '');
    setStoredHubUrl(clean);
    setHubUrl(clean);
    setShowSettingsModal(false);
    verifyConnection(clean);
  };

  const activeBatch = batches.find((b) => b.id === selectedBatchId) || batches[0] || {};

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#060a12',
        color: '#f8fafc',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        paddingBottom: '100px',
      }}
    >
      {/* Toast Notification */}
      {toastMessage && (
        <div
          style={{
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
            boxShadow: '0 10px 30px rgba(16, 185, 129, 0.4)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
          }}
        >
          <CheckCircle2 size={20} />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          backgroundColor: '#090f1d',
          borderBottom: '1px solid #1a273f',
          padding: '12px 16px',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                backgroundColor: '#111d33',
                border: '1px solid #c5a880',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                flexShrink: 0,
              }}
            >
              {academySettings.logo ? (
                <img
                  src={academySettings.logo}
                  alt="Logo"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <School size={22} color="#c5a880" />
              )}
            </div>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: '#ffffff', lineHeight: 1.2 }}>
                {academySettings.academy_name || 'Noble Academy'}
              </div>
              <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 500 }}>
                Teacher Attendance App
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={() => verifyConnection()}
              style={{
                background: '#111d33',
                border: '1px solid #1a273f',
                color: '#94a3b8',
                padding: '8px',
                borderRadius: '8px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              title="Refresh connection"
            >
              <RefreshCw size={16} className={isChecking ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={() => {
                setUrlInput(hubUrl);
                setShowSettingsModal(true);
              }}
              style={{
                background: '#111d33',
                border: '1px solid #1a273f',
                color: '#c5a880',
                padding: '8px',
                borderRadius: '8px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              title="School PC Wi-Fi Settings"
            >
              <Settings size={16} />
            </button>
          </div>
        </div>

        {/* Live Wi-Fi Connection Bar */}
        <div
          onClick={() => {
            setUrlInput(hubUrl);
            setShowSettingsModal(true);
          }}
          style={{
            marginTop: '10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '6px 12px',
            borderRadius: '8px',
            backgroundColor: isConnected ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
            border: `1px solid ${isConnected ? 'rgba(16, 185, 129, 0.35)' : 'rgba(239, 68, 68, 0.35)'}`,
            cursor: 'pointer',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {isConnected ? (
              <span
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: '#10b981',
                  boxShadow: '0 0 8px #10b981',
                }}
              />
            ) : (
              <span
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: '#ef4444',
                  boxShadow: '0 0 8px #ef4444',
                }}
              />
            )}
            <span
              style={{
                fontSize: '12px',
                fontWeight: 600,
                color: isConnected ? '#10b981' : '#f87171',
              }}
            >
              {isConnected ? 'Connected to School PC' : 'Offline / Tap to configure Wi-Fi'}
            </span>
          </div>
          <span style={{ fontSize: '11px', color: '#94a3b8', fontFamily: 'monospace' }}>
            {hubUrl.replace(/^https?:\/\//, '')}
          </span>
        </div>
      </header>

      {/* Main Content Area */}
      <main style={{ padding: '16px' }}>
        {/* Error Notice */}
        {errorMessage && (
          <div
            style={{
              backgroundColor: 'rgba(239, 68, 68, 0.12)',
              border: '1px solid #ef4444',
              borderRadius: '12px',
              padding: '12px 14px',
              marginBottom: '14px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '10px',
            }}
          >
            <AlertCircle size={18} color="#ef4444" style={{ flexShrink: 0, marginTop: '2px' }} />
            <div style={{ fontSize: '12px', color: '#fecaca', lineHeight: 1.4 }}>
              <strong>Not connected to School PC:</strong> {errorMessage}
              <div style={{ marginTop: '6px' }}>
                <button
                  onClick={() => setShowSettingsModal(true)}
                  style={{
                    backgroundColor: '#ef4444',
                    color: '#ffffff',
                    border: 'none',
                    padding: '5px 12px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Configure PC IP Address
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Class / Cohort Selector Pills */}
        <div style={{ marginBottom: '14px' }}>
          <div
            style={{
              fontSize: '11px',
              fontWeight: 700,
              color: '#94a3b8',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginBottom: '8px',
            }}
          >
            Select Class:
          </div>
          <div
            style={{
              display: 'flex',
              gap: '8px',
              overflowX: 'auto',
              paddingBottom: '4px',
              scrollbarWidth: 'none',
            }}
          >
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
                    backgroundColor: active ? '#c5a880' : '#0e1726',
                    color: active ? '#060a12' : '#cbd5e1',
                    border: `1px solid ${active ? '#c5a880' : '#1f2e47'}`,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    boxShadow: active ? '0 2px 10px rgba(197, 168, 128, 0.3)' : 'none',
                  }}
                >
                  {b.name}
                </button>
              );
            })}
          </div>
        </div>

        {/* Date Selector */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: '#0e1726',
            border: '1px solid #1f2e47',
            borderRadius: '12px',
            padding: '10px 14px',
            marginBottom: '14px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Calendar size={16} color="#c5a880" />
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#e2e8f0' }}>Roll Call Date:</span>
          </div>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            style={{
              backgroundColor: '#060a12',
              border: '1px solid #1f2e47',
              borderRadius: '8px',
              color: '#ffffff',
              padding: '6px 10px',
              fontSize: '13px',
              outline: 'none',
              fontWeight: 500,
            }}
          />
        </div>

        {/* Live Counters & Quick Action Bar */}
        <div
          style={{
            backgroundColor: '#0e1726',
            border: '1px solid #1f2e47',
            borderRadius: '14px',
            padding: '14px',
            marginBottom: '14px',
            boxShadow: '0 4px 15px rgba(0, 0, 0, 0.25)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#f1f5f9' }}>
              {activeBatch.name || 'Student Attendance'}
            </span>
            <span
              style={{
                fontSize: '12px',
                fontWeight: 700,
                padding: '3px 10px',
                borderRadius: '8px',
                backgroundColor: attendancePercentage >= 75 ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                color: attendancePercentage >= 75 ? '#34d399' : '#f87171',
              }}
            >
              {attendancePercentage}% Present
            </span>
          </div>

          {/* 3 Metric Pills */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', textAlign: 'center' }}>
            <div
              style={{
                backgroundColor: '#060a12',
                padding: '10px 4px',
                borderRadius: '10px',
                border: '1px solid #1a273f',
              }}
            >
              <div style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>
                Total
              </div>
              <div style={{ fontSize: '20px', fontWeight: 800, color: '#f8fafc', marginTop: '2px' }}>
                {totalCount}
              </div>
            </div>
            <div
              style={{
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                padding: '10px 4px',
                borderRadius: '10px',
                border: '1px solid rgba(16, 185, 129, 0.3)',
              }}
            >
              <div style={{ fontSize: '11px', color: '#34d399', textTransform: 'uppercase', fontWeight: 600 }}>
                Present
              </div>
              <div style={{ fontSize: '20px', fontWeight: 800, color: '#10b981', marginTop: '2px' }}>
                {presentCount}
              </div>
            </div>
            <div
              style={{
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                padding: '10px 4px',
                borderRadius: '10px',
                border: '1px solid rgba(239, 68, 68, 0.3)',
              }}
            >
              <div style={{ fontSize: '11px', color: '#f87171', textTransform: 'uppercase', fontWeight: 600 }}>
                Absent
              </div>
              <div style={{ fontSize: '20px', fontWeight: 800, color: '#ef4444', marginTop: '2px' }}>
                {absentCount}
              </div>
            </div>
          </div>

          {/* Quick Mark Shortcuts */}
          <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
            <button
              onClick={markAllPresent}
              style={{
                flex: 1,
                backgroundColor: 'rgba(16, 185, 129, 0.15)',
                color: '#34d399',
                border: '1px solid rgba(16, 185, 129, 0.4)',
                borderRadius: '8px',
                padding: '8px 10px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
              }}
            >
              <CheckCheck size={16} />
              Mark All Present
            </button>
            <button
              onClick={markAllAbsent}
              style={{
                flex: 1,
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                color: '#f87171',
                border: '1px solid rgba(239, 68, 68, 0.4)',
                borderRadius: '8px',
                padding: '8px 10px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
              }}
            >
              <XCircle size={16} />
              Mark All Absent
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div style={{ position: 'relative', marginBottom: '14px' }}>
          <Search size={16} color="#94a3b8" style={{ position: 'absolute', left: '12px', top: '12px' }} />
          <input
            type="text"
            placeholder="Search by student name or roll number..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: '100%',
              backgroundColor: '#0e1726',
              border: '1px solid #1f2e47',
              borderRadius: '10px',
              padding: '10px 12px 10px 36px',
              color: '#ffffff',
              fontSize: '13px',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Student Roster List */}
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '50px 0', color: '#94a3b8' }}>
            <RefreshCw size={28} className="animate-spin" style={{ margin: '0 auto 12px auto', color: '#c5a880' }} />
            <div style={{ fontSize: '14px' }}>Loading students from School PC...</div>
          </div>
        ) : filteredStudents.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '40px 16px',
              backgroundColor: '#0e1726',
              border: '1px solid #1f2e47',
              borderRadius: '12px',
              color: '#94a3b8',
            }}
          >
            No students found matching your search.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {filteredStudents.map((s, index) => {
              const currentStatus = attendanceMap[s.id] || 'Present';
              const isPresent = currentStatus === 'Present';
              const isAbsent = currentStatus === 'Absent';

              return (
                <div
                  key={s.id}
                  style={{
                    backgroundColor: '#0e1726',
                    border: `1.5px solid ${isPresent ? 'rgba(16, 185, 129, 0.4)' : isAbsent ? 'rgba(239, 68, 68, 0.4)' : '#1f2e47'
                      }`,
                    borderRadius: '14px',
                    padding: '12px 14px',
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {/* Student Info Row */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: '10px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div
                        style={{
                          width: '34px',
                          height: '34px',
                          borderRadius: '8px',
                          backgroundColor: '#060a12',
                          border: '1px solid #1f2e47',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 800,
                          fontSize: '13px',
                          color: '#c5a880',
                        }}
                      >
                        #{s.roll_no || index + 1}
                      </div>
                      <div>
                        <div style={{ fontSize: '14px', fontWeight: 700, color: '#f8fafc', lineHeight: 1.2 }}>
                          {s.full_name}
                        </div>
                        <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                          Adm: {s.admission_no} • {s.gender || 'Student'}
                        </div>
                      </div>
                    </div>

                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 800,
                        padding: '3px 10px',
                        borderRadius: '6px',
                        backgroundColor: isPresent ? '#10b981' : isAbsent ? '#ef4444' : '#1f2e47',
                        color: '#ffffff',
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                      }}
                    >
                      {currentStatus}
                    </span>
                  </div>

                  {/* 2 Clean Tactile Buttons: PRESENT vs ABSENT */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <button
                      onClick={() => setStudentStatus(s.id, 'Present')}
                      style={{
                        padding: '10px 0',
                        borderRadius: '10px',
                        fontSize: '13px',
                        fontWeight: 700,
                        backgroundColor: isPresent ? '#10b981' : '#060a12',
                        color: isPresent ? '#ffffff' : '#94a3b8',
                        border: `1.5px solid ${isPresent ? '#10b981' : '#1f2e47'}`,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        boxShadow: isPresent ? '0 2px 10px rgba(16, 185, 129, 0.35)' : 'none',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <CheckCircle2 size={16} />
                      Present
                    </button>
                    <button
                      onClick={() => setStudentStatus(s.id, 'Absent')}
                      style={{
                        padding: '10px 0',
                        borderRadius: '10px',
                        fontSize: '13px',
                        fontWeight: 700,
                        backgroundColor: isAbsent ? '#ef4444' : '#060a12',
                        color: isAbsent ? '#ffffff' : '#94a3b8',
                        border: `1.5px solid ${isAbsent ? '#ef4444' : '#1f2e47'}`,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        boxShadow: isAbsent ? '0 2px 10px rgba(239, 68, 68, 0.35)' : 'none',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <XCircle size={16} />
                      Absent
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Sticky Bottom Action Bar ("DONE") */}
      <div
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          backgroundColor: '#090f1d',
          borderTop: '1px solid #1a273f',
          padding: '12px 16px',
          boxShadow: '0 -4px 25px rgba(0, 0, 0, 0.5)',
          zIndex: 40,
        }}
      >
        <button
          onClick={handleSubmit}
          disabled={isSubmitting || students.length === 0}
          style={{
            width: '100%',
            backgroundColor: isConnected ? '#10b981' : '#f59e0b',
            color: '#ffffff',
            border: 'none',
            borderRadius: '12px',
            padding: '15px 16px',
            fontSize: '15px',
            fontWeight: 800,
            cursor: isSubmitting || students.length === 0 ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            boxShadow: isConnected
              ? '0 4px 18px rgba(16, 185, 129, 0.45)'
              : '0 4px 18px rgba(245, 158, 11, 0.45)',
            transition: 'all 0.15s ease',
          }}
        >
          {isSubmitting ? (
            <>
              <RefreshCw size={18} className="animate-spin" />
              Saving to School PC...
            </>
          ) : (
            <>
              <Check size={20} strokeWidth={3} />
              DONE — Save to School PC ({presentCount} Present, {absentCount} Absent)
            </>
          )}
        </button>
      </div>

      {/* Success Modal */}
      {showSuccessModal && savedSummary && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.75)',
            backdropFilter: 'blur(4px)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
        >
          <div
            style={{
              backgroundColor: '#0e1726',
              border: '1px solid #10b981',
              borderRadius: '18px',
              padding: '24px',
              maxWidth: '380px',
              width: '100%',
              textAlign: 'center',
              boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
            }}
          >
            <div
              style={{
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                backgroundColor: 'rgba(16, 185, 129, 0.15)',
                border: '2px solid #10b981',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px auto',
                color: '#10b981',
              }}
            >
              <Check size={32} strokeWidth={3} />
            </div>

            <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: 800, color: '#f8fafc' }}>
              Attendance Saved to School PC!
            </h3>
            <p style={{ margin: '0 0 18px 0', fontSize: '13px', color: '#94a3b8', lineHeight: 1.4 }}>
              The attendance records have been successfully written into the school computer database over Wi-Fi.
            </p>

            <div
              style={{
                backgroundColor: '#060a12',
                border: '1px solid #1f2e47',
                borderRadius: '12px',
                padding: '12px',
                marginBottom: '18px',
                fontSize: '13px',
                textAlign: 'left',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#cbd5e1' }}>
                <span style={{ color: '#94a3b8' }}>Class:</span>
                <strong>{savedSummary.batchName}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#cbd5e1' }}>
                <span style={{ color: '#94a3b8' }}>Date:</span>
                <strong>{savedSummary.date}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#cbd5e1' }}>
                <span style={{ color: '#94a3b8' }}>Present:</span>
                <strong style={{ color: '#10b981' }}>{savedSummary.present} Students</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#cbd5e1' }}>
                <span style={{ color: '#94a3b8' }}>Absent:</span>
                <strong style={{ color: '#ef4444' }}>{savedSummary.absent} Students</strong>
              </div>
            </div>

            <button
              onClick={() => setShowSuccessModal(false)}
              style={{
                width: '100%',
                backgroundColor: '#10b981',
                color: '#ffffff',
                border: 'none',
                borderRadius: '10px',
                padding: '12px',
                fontSize: '14px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Done / OK
            </button>
          </div>
        </div>
      )}

      {/* Settings Modal (Configure School PC IP) */}
      {showSettingsModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.75)',
            backdropFilter: 'blur(4px)',
            zIndex: 999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
        >
          <div
            style={{
              backgroundColor: '#0e1726',
              border: '1px solid #1f2e47',
              borderRadius: '16px',
              padding: '22px',
              maxWidth: '390px',
              width: '100%',
              boxShadow: '0 20px 45px rgba(0,0,0,0.5)',
            }}
          >
            <h3 style={{ margin: '0 0 8px 0', fontSize: '17px', fontWeight: 700, color: '#f8fafc' }}>
              Connect to School PC
            </h3>
            <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: '#94a3b8', lineHeight: 1.4 }}>
              Enter the local Wi-Fi address of the School PC.
            </p>

            <label
              style={{
                display: 'block',
                fontSize: '11px',
                fontWeight: 700,
                color: '#cbd5e1',
                marginBottom: '6px',
                textTransform: 'uppercase',
              }}
            >
              School PC Wi-Fi URL:
            </label>
            <input
              type="text"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="e.g. http://10.102.139.146:5173"
              style={{
                width: '100%',
                backgroundColor: '#060a12',
                border: '1px solid #1f2e47',
                borderRadius: '8px',
                padding: '10px 12px',
                color: '#ffffff',
                fontSize: '14px',
                outline: 'none',
                marginBottom: '10px',
                boxSizing: 'border-box',
                fontFamily: 'monospace',
              }}
            />

            {/* Quick Preset button */}
            <button
              type="button"
              onClick={() => setUrlInput(DEFAULT_SCHOOL_PC_URL)}
              style={{
                backgroundColor: 'transparent',
                border: 'none',
                color: '#c5a880',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                padding: '0 0 14px 0',
                display: 'block',
              }}
            >
              ↺ Reset to Default ({DEFAULT_SCHOOL_PC_URL.replace('http://', '')})
            </button>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => setShowSettingsModal(false)}
                style={{
                  flex: 1,
                  backgroundColor: 'transparent',
                  border: '1px solid #1f2e47',
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
                  color: '#060a12',
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
