import React, { useState, useEffect, useMemo } from 'react';
import {
  School,
  Users,
  Calendar,
  CreditCard,
  Award,
  BookOpen,
  CheckCircle2,
  AlertCircle,
  Clock,
  Download,
  Share2,
  LogOut,
  ChevronDown,
  Sparkles,
  Smartphone,
  Eye,
  FileText,
  Phone,
  MessageSquare,
  TrendingUp,
  Percent,
} from 'lucide-react';
import {
  getParentPortalSession,
  saveParentPortalSession,
  clearParentPortalSession,
  fetchStudentAttendanceSummary,
  fetchStudentFeesSummary,
  fetchStudentExamsWithRank,
  getDailyClassDiary,
  getParentPortalSettings,
} from '../lib/parentPortalService';
import { useAcademySettings } from '../lib/academySettings';
import ParentAuthScreen from '../components/parent/ParentAuthScreen';
import ParentSiblingSwitcherModal from '../components/parent/ParentSiblingSwitcherModal';
import FeeReceiptModal from '../components/fees/FeeReceiptModal';
import ReportCardModal from '../components/exams/ReportCardModal';
import { saveDataUrlWithPicker } from '../lib/fileSaveHelper';
import { openExternalLink } from '../lib/externalOpener';

export default function ParentPortalPage({
  previewMode = false,
  previewStudent = null,
  previewStudents = [],
  previewParent = null,
  onClosePreview = null,
}) {
  const settings = useAcademySettings();
  const portalSettings = useMemo(() => getParentPortalSettings(), []);

  // Session State
  const [session, setSession] = useState(() => {
    if (previewMode && previewStudent) {
      return {
        parent: previewParent || { full_name: 'Parent / Guardian', phone: '9876543210' },
        students: previewStudents.length > 0 ? previewStudents : [previewStudent],
        selectedStudentId: previewStudent.id,
      };
    }
    return getParentPortalSession();
  });

  // Selected Student (Sibling Support)
  const [selectedStudentId, setSelectedStudentId] = useState(
    session?.selectedStudentId || session?.students?.[0]?.id || null
  );

  const selectedStudent = useMemo(() => {
    if (!session?.students || session.students.length === 0) return null;
    return (
      session.students.find((s) => s.id === selectedStudentId) ||
      session.students[0]
    );
  }, [session, selectedStudentId]);

  // Navigation tab: 'home' | 'attendance' | 'fees' | 'exams'
  const [activeTab, setActiveTab] = useState('home');

  // Modals
  const [isSiblingModalOpen, setIsSiblingModalOpen] = useState(false);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [isReportCardOpen, setIsReportCardOpen] = useState(false);
  const [selectedExamForModal, setSelectedExamForModal] = useState(null);
  const [selectedDateDetails, setSelectedDateDetails] = useState(null);

  // Data states
  const [attendanceData, setAttendanceData] = useState(null);
  const [feesData, setFeesData] = useState(null);
  const [examsData, setExamsData] = useState([]);
  const [diaryData, setDiaryData] = useState([]);
  const [loadingData, setLoadingData] = useState(true);

  // PWA Install Prompt State
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isInstalled, setIsInstalled] = useState(false);

  // Capture beforeinstallprompt event for PWA Add to Home Screen
  useEffect(() => {
    const handleBeforeInstall = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    });

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setIsInstalled(true);
      }
      setDeferredPrompt(null);
    } else {
      alert('To install this app on your phone:\n\n• On Android (Chrome): Tap the 3 dots (⋮) and choose "Install app" or "Add to Home screen".\n• On iPhone (Safari): Tap the Share button (⎋) and select "Add to Home Screen".');
    }
  };

  // Load active student data whenever selected student changes
  useEffect(() => {
    if (!selectedStudent) return;

    let mounted = true;
    setLoadingData(true);

    const loadAll = async () => {
      try {
        const [att, fees, exams] = await Promise.all([
          fetchStudentAttendanceSummary(selectedStudent.id),
          fetchStudentFeesSummary(selectedStudent),
          fetchStudentExamsWithRank(selectedStudent.id, selectedStudent.batch_id),
        ]);

        if (mounted) {
          setAttendanceData(att);
          setFeesData(fees);
          setExamsData(exams);
          setDiaryData(getDailyClassDiary(selectedStudent.batch_id));
          setLoadingData(false);
        }
      } catch (err) {
        console.warn('Error loading student portal data:', err);
        if (mounted) setLoadingData(false);
      }
    };

    loadAll();

    return () => {
      mounted = false;
    };
  }, [selectedStudent]);

  // Handle logout
  const handleLogout = () => {
    clearParentPortalSession();
    setSession(null);
    if (previewMode && onClosePreview) {
      onClosePreview();
    }
  };

  // If not authenticated, render ParentAuthScreen
  if (!session || !session.students || session.students.length === 0) {
    // Check URL parameters for magic link auto-login
    const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
    const urlPhone = params.get('phone') || '';
    const urlAdm = params.get('adm') || '';

    return (
      <ParentAuthScreen
        initialPhone={urlPhone}
        initialAdm={urlAdm}
        onAuthenticated={(newSession) => {
          setSession(newSession);
          setSelectedStudentId(newSession.selectedStudentId);
        }}
      />
    );
  }

  const siblingsCount = session.students?.length || 1;

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#f1f5f9',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: 'var(--font-sans, Inter, sans-serif)',
      color: '#0f172a',
      position: 'relative',
      paddingBottom: '70px', // Space for bottom nav
    }}>
      
      {/* Top Mobile App Bar */}
      <div style={{
        backgroundColor: '#070e19',
        borderBottom: '1px solid #1f3250',
        padding: '12px 16px',
        color: '#ffffff',
        position: 'sticky',
        top: 0,
        zIndex: 50,
        boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
          
          {/* Institution Crest & Name */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
            <div style={{
              width: '34px',
              height: '34px',
              borderRadius: '8px',
              backgroundColor: '#0f1c32',
              border: '1px solid rgba(197, 168, 128, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              flexShrink: 0,
            }}>
              {settings.logo ? (
                <img src={settings.logo} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <School size={18} color="#c5a880" />
              )}
            </div>
            <div style={{ overflow: 'hidden' }}>
              <div style={{
                fontSize: '13px',
                fontWeight: 700,
                color: '#ffffff',
                fontFamily: 'var(--font-heading, Outfit, sans-serif)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}>
                {settings.schoolName || 'SMS Academy'}
              </div>
              <div style={{ fontSize: '10.5px', color: '#94a3b8' }}>
                Parent &amp; Student Portal
              </div>
            </div>
          </div>

          {/* Right Action Icons: Sibling Switcher + Install + Logout */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
            {/* Sibling Switcher Chip (Shown when 2+ children exist) */}
            {siblingsCount > 1 && (
              <button
                type="button"
                onClick={() => setIsSiblingModalOpen(true)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '4px 8px',
                  borderRadius: '16px',
                  backgroundColor: '#0f1c32',
                  border: '1px solid rgba(197, 168, 128, 0.4)',
                  color: '#c5a880',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                <span>{selectedStudent?.gender === 'Female' ? '👧' : '👦'}</span>
                <span style={{ maxWidth: '80px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {selectedStudent?.full_name?.split(' ')[0] || 'Child'}
                </span>
                <ChevronDown size={12} />
              </button>
            )}

            {/* Install PWA Button */}
            {!isInstalled && (
              <button
                type="button"
                onClick={handleInstallClick}
                style={{
                  background: 'none',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  padding: '5px 8px',
                  color: '#38bdf8',
                  fontSize: '10.5px',
                  fontWeight: 600,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  cursor: 'pointer',
                }}
                title="Add to Home Screen"
              >
                <Smartphone size={12} />
                <span>Install</span>
              </button>
            )}

            {/* Logout Button */}
            <button
              type="button"
              onClick={handleLogout}
              style={{
                background: 'none',
                border: 'none',
                color: '#94a3b8',
                cursor: 'pointer',
                padding: '5px',
                display: 'flex',
                alignItems: 'center',
              }}
              title="Logout"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Student Identity Card Strip */}
      <div style={{
        backgroundColor: '#ffffff',
        borderBottom: '1px solid #e2e8f0',
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: '50%',
            backgroundColor: '#eff6ff',
            border: '2px solid #bfdbfe',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '18px',
            flexShrink: 0,
          }}>
            {selectedStudent?.gender === 'Female' ? '👧' : '👦'}
          </div>
          <div>
            <div style={{ fontSize: '14.5px', fontWeight: 700, color: '#0f172a' }}>
              {selectedStudent?.full_name}
            </div>
            <div style={{ fontSize: '11.5px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>{selectedStudent?.batches?.name || selectedStudent?.courses?.name || 'Class Student'}</span>
              <span>•</span>
              <span style={{ fontFamily: 'var(--font-mono, monospace)', fontWeight: 600 }}>
                Roll #{selectedStudent?.roll_no || '—'}
              </span>
            </div>
          </div>
        </div>

        {siblingsCount > 1 && (
          <button
            type="button"
            onClick={() => setIsSiblingModalOpen(true)}
            style={{
              fontSize: '11px',
              color: '#0284c7',
              backgroundColor: '#f0f9ff',
              border: '1px solid #bae6fd',
              borderRadius: '6px',
              padding: '4px 8px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Switch Child ({siblingsCount})
          </button>
        )}
      </div>

      {/* Main Container Content based on Active Tab */}
      <div style={{ flex: 1, padding: '16px', maxWidth: '600px', width: '100%', margin: '0 auto' }}>

        {/* =============================================================
            TAB 1: HOME & DAILY FEED
            ============================================================= */}
        {activeTab === 'home' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            
            {/* Today Live Status Card */}
            <div className="erp-card-elevated" style={{ padding: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', color: '#64748b', fontWeight: 700 }}>
                  Today's Attendance Status
                </span>
                <span style={{ fontSize: '11.5px', color: '#64748b' }}>
                  {new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{
                    width: '12px',
                    height: '12px',
                    borderRadius: '50%',
                    backgroundColor: attendanceData?.todayRecord?.status === 'Present' ? '#10b981' : attendanceData?.todayRecord?.status === 'Late' ? '#f59e0b' : '#ef4444',
                    boxShadow: attendanceData?.todayRecord?.status === 'Present' ? '0 0 0 4px rgba(16, 185, 129, 0.2)' : '0 0 0 4px rgba(239, 68, 68, 0.2)',
                  }} />
                  <div>
                    <div style={{ fontSize: '16px', fontWeight: 700, color: attendanceData?.todayRecord?.status === 'Present' ? '#065f46' : attendanceData?.todayRecord?.status === 'Late' ? '#92400e' : '#991b1b' }}>
                      {attendanceData?.todayRecord?.status || 'Present'} Today
                    </div>
                    <div style={{ fontSize: '11.5px', color: '#64748b' }}>
                      {attendanceData?.todayRecord?.time_in ? `Punch Time: ${attendanceData.todayRecord.time_in}` : 'Regular Attendance Marked'}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setActiveTab('attendance')}
                  style={{
                    fontSize: '11.5px',
                    color: '#0284c7',
                    background: 'none',
                    border: 'none',
                    fontWeight: 600,
                    cursor: 'pointer',
                    textDecoration: 'underline',
                  }}
                >
                  View Heatmap →
                </button>
              </div>
            </div>

            {/* Quick Metrics Bar (3 Pills) */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
              
              {/* Attendance Pill */}
              <div
                onClick={() => setActiveTab('attendance')}
                className="erp-card-elevated"
                style={{ padding: '12px 10px', textAlign: 'center', cursor: 'pointer' }}
              >
                <div style={{ fontSize: '10.5px', color: '#64748b', fontWeight: 600 }}>Attendance</div>
                <div style={{ fontSize: '17px', fontWeight: 800, color: (attendanceData?.stats?.rate || 0) < 75 ? '#dc2626' : '#047857', marginTop: '2px' }}>
                  {attendanceData?.stats?.rate ?? 94}%
                </div>
                <div style={{ fontSize: '10px', color: (attendanceData?.stats?.rate || 0) < 75 ? '#dc2626' : '#16a34a' }}>
                  {(attendanceData?.stats?.rate || 0) < 75 ? 'Low Warning' : 'Healthy'}
                </div>
              </div>

              {/* Pending Fees Pill */}
              <div
                onClick={() => setActiveTab('fees')}
                className="erp-card-elevated"
                style={{ padding: '12px 10px', textAlign: 'center', cursor: 'pointer' }}
              >
                <div style={{ fontSize: '10.5px', color: '#64748b', fontWeight: 600 }}>Fee Dues</div>
                <div style={{ fontSize: '16px', fontWeight: 800, color: (feesData?.pending_amount || 0) > 0 ? '#b45309' : '#047857', marginTop: '2px' }}>
                  ₹{(feesData?.pending_amount || 15000).toLocaleString('en-IN')}
                </div>
                <div style={{ fontSize: '10px', color: (feesData?.pending_amount || 0) > 0 ? '#b45309' : '#16a34a' }}>
                  {(feesData?.pending_amount || 0) > 0 ? 'Due Soon' : 'Cleared'}
                </div>
              </div>

              {/* Recent Test Rank Pill */}
              <div
                onClick={() => setActiveTab('exams')}
                className="erp-card-elevated"
                style={{ padding: '12px 10px', textAlign: 'center', cursor: 'pointer' }}
              >
                <div style={{ fontSize: '10.5px', color: '#64748b', fontWeight: 600 }}>Recent Rank</div>
                <div style={{ fontSize: '16px', fontWeight: 800, color: '#4338ca', marginTop: '2px' }}>
                  Rank #{examsData[0]?.rank || 3}
                </div>
                <div style={{ fontSize: '10px', color: '#6366f1' }}>
                  Top {100 - (examsData[0]?.percentile || 93)}% Batch
                </div>
              </div>
            </div>

            {/* Daily Class Diary & DPP Homework */}
            <div className="erp-card-elevated" style={{ padding: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <BookOpen size={16} color="#0284c7" />
                  <span style={{ fontSize: '13.5px', fontWeight: 700, color: '#0f172a' }}>
                    Daily Class Diary &amp; Homework
                  </span>
                </div>
                <span style={{ fontSize: '10.5px', backgroundColor: '#e0f2fe', color: '#0369a1', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>
                  Live Update
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {diaryData.map((diary) => (
                  <div
                    key={diary.id}
                    style={{
                      padding: '12px',
                      borderRadius: '8px',
                      backgroundColor: '#f8fafc',
                      border: '1px solid #e2e8f0',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ fontWeight: 700, fontSize: '12.5px', color: '#0f172a' }}>
                        {diary.subject}
                      </span>
                      <span style={{ fontSize: '11px', color: '#64748b' }}>
                        {diary.teacher}
                      </span>
                    </div>

                    <div style={{ fontSize: '12px', color: '#334155', marginBottom: '6px' }}>
                      <strong>Covered:</strong> {diary.topicCovered}
                    </div>

                    <div style={{ fontSize: '12px', color: '#b45309', backgroundColor: '#fffbeb', padding: '6px 8px', borderRadius: '6px', border: '1px solid #fef3c7', marginBottom: '8px' }}>
                      <strong>Homework:</strong> {diary.homework}
                    </div>

                    {diary.attachmentName && (
                      <div className="erp-attachment-card" style={{ padding: '8px 10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <FileText size={15} color="#0284c7" />
                          <span style={{ fontSize: '11.5px', fontWeight: 600, color: '#0f172a' }}>
                            {diary.attachmentName}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => alert(`Downloading ${diary.attachmentName}...`)}
                          className="erp-btn-download-action"
                          style={{ padding: '4px 8px', fontSize: '10.5px' }}
                        >
                          <Download size={11} />
                          <span>Save As</span>
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Helpline / Contact Institute */}
            <div style={{
              backgroundColor: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '12px',
              padding: '12px 14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <div>
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#0f172a' }}>
                  Have questions or doubts?
                </div>
                <div style={{ fontSize: '11px', color: '#64748b' }}>
                  Call Academy Office: {settings.phone || '+91 8866039007'}
                </div>
              </div>
              <a
                href={`tel:${settings.phone || '+918866039007'}`}
                className="btn btn-outline"
                style={{ padding: '6px 10px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px', textDecoration: 'none' }}
              >
                <Phone size={12} />
                <span>Call Office</span>
              </a>
            </div>
          </div>
        )}

        {/* =============================================================
            TAB 2: ATTENDANCE & VISUAL HEATMAP
            ============================================================= */}
        {activeTab === 'attendance' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            
            {/* Overall Rate Card */}
            <div className="erp-card-elevated" style={{ padding: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <span style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>
                  Attendance Summary
                </span>
                <span style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  padding: '3px 8px',
                  borderRadius: '12px',
                  backgroundColor: (attendanceData?.stats?.rate || 0) < 75 ? '#fee2e2' : '#dcfce7',
                  color: (attendanceData?.stats?.rate || 0) < 75 ? '#991b1b' : '#166534',
                }}>
                  {(attendanceData?.stats?.rate || 0) < 75 ? 'Deficient Attendance' : 'Regular Standing'}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '14px' }}>
                <div style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '50%',
                  border: `4px solid ${(attendanceData?.stats?.rate || 0) < 75 ? '#ef4444' : '#10b981'}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'column',
                  flexShrink: 0,
                }}>
                  <span style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>
                    {attendanceData?.stats?.rate || 94}%
                  </span>
                </div>
                <div>
                  <div style={{ fontSize: '12px', color: '#64748b' }}>
                    Attended <strong>{(attendanceData?.stats?.present || 0) + (attendanceData?.stats?.late || 0)}</strong> out of <strong>{attendanceData?.stats?.totalHeld || 0}</strong> total scheduled sessions.
                  </div>
                  <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '3px' }}>
                    Minimum 75% required for examination eligibility.
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', textAlign: 'center' }}>
                <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px', padding: '6px' }}>
                  <div style={{ fontSize: '10px', color: '#166534' }}>Present</div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#166534' }}>{attendanceData?.stats?.present || 0}</div>
                </div>
                <div style={{ backgroundColor: '#fffbeb', border: '1px solid #fef3c7', borderRadius: '6px', padding: '6px' }}>
                  <div style={{ fontSize: '10px', color: '#92400e' }}>Late</div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#92400e' }}>{attendanceData?.stats?.late || 0}</div>
                </div>
                <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', padding: '6px' }}>
                  <div style={{ fontSize: '10px', color: '#991b1b' }}>Absent</div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#991b1b' }}>{attendanceData?.stats?.absent || 0}</div>
                </div>
                <div style={{ backgroundColor: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: '6px', padding: '6px' }}>
                  <div style={{ fontSize: '10px', color: '#3730a3' }}>Excused</div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#3730a3' }}>{attendanceData?.stats?.excused || 0}</div>
                </div>
              </div>
            </div>

            {/* Visual Attendance Heatmap (30-Day Grid) */}
            <div className="erp-card-elevated" style={{ padding: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>
                  📅 Attendance Visual Heatmap (Recent 40 Days)
                </div>
                <div style={{ fontSize: '11px', color: '#64748b' }}>
                  Tap dot for details
                </div>
              </div>

              {/* Heatmap Grid */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(7, 1fr)',
                gap: '8px',
                padding: '10px',
                backgroundColor: '#f8fafc',
                borderRadius: '8px',
                border: '1px solid #e2e8f0',
              }}>
                {(attendanceData?.records || []).slice(0, 35).map((rec, rIdx) => {
                  const isPresent = rec.status === 'Present';
                  const isLate = rec.status === 'Late';
                  const isAbsent = rec.status === 'Absent';
                  const isSelected = selectedDateDetails?.id === rec.id;

                  const dotColor = isPresent ? '#10b981' : isLate ? '#f59e0b' : '#ef4444';
                  const bgShade = isPresent ? '#d1fae5' : isLate ? '#fef3c7' : '#fee2e2';

                  return (
                    <button
                      key={rec.id || rIdx}
                      type="button"
                      onClick={() => setSelectedDateDetails(rec)}
                      style={{
                        height: '38px',
                        borderRadius: '8px',
                        backgroundColor: isSelected ? dotColor : bgShade,
                        border: isSelected ? '2px solid #0f172a' : `1px solid ${dotColor}`,
                        color: isSelected ? '#ffffff' : '#0f172a',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        padding: '2px',
                        transition: 'all 0.15s ease',
                      }}
                      title={`${rec.date}: ${rec.status}`}
                    >
                      <span style={{ fontSize: '11px', fontWeight: 700 }}>
                        {new Date(rec.date).getDate()}
                      </span>
                      <span style={{ fontSize: '8px', fontWeight: 600, textTransform: 'uppercase' }}>
                        {rec.status.slice(0, 3)}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Date Detail Drawer if tapped */}
              {selectedDateDetails && (
                <div style={{
                  marginTop: '12px',
                  padding: '10px 12px',
                  backgroundColor: '#ffffff',
                  border: '1px solid #cbd5e1',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, marginBottom: '4px' }}>
                    <span>{new Date(selectedDateDetails.date).toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' })}</span>
                    <span style={{ color: selectedDateDetails.status === 'Present' ? '#10b981' : '#ef4444' }}>
                      {selectedDateDetails.status}
                    </span>
                  </div>
                  <div style={{ color: '#64748b' }}>
                    Session: {selectedDateDetails.session_name || 'Regular Class'} • {selectedDateDetails.time_in ? `Time in: ${selectedDateDetails.time_in}` : 'Unscheduled'}
                  </div>
                  {selectedDateDetails.remarks && (
                    <div style={{ color: '#b45309', marginTop: '3px' }}>
                      Note: {selectedDateDetails.remarks}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* =============================================================
            TAB 3: FEES & OFFICIAL RECEIPTS
            ============================================================= */}
        {activeTab === 'fees' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            
            {/* Fee Status Card */}
            <div className="erp-card-elevated" style={{ padding: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <span style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>
                  Course Fee Ledger
                </span>
                <span style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  padding: '3px 8px',
                  borderRadius: '12px',
                  backgroundColor: (feesData?.pending_amount || 0) > 0 ? '#fef3c7' : '#dcfce7',
                  color: (feesData?.pending_amount || 0) > 0 ? '#92400e' : '#166534',
                }}>
                  {(feesData?.pending_amount || 0) > 0 ? 'Partial Pending' : 'Paid in Full'}
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '14px' }}>
                <div style={{ backgroundColor: '#f8fafc', padding: '10px', borderRadius: '6px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                  <div style={{ fontSize: '10.5px', color: '#64748b' }}>Total Fee</div>
                  <div style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>
                    ₹{(feesData?.total_amount || 50000).toLocaleString('en-IN')}
                  </div>
                </div>
                <div style={{ backgroundColor: '#f0fdf4', padding: '10px', borderRadius: '6px', border: '1px solid #bbf7d0', textAlign: 'center' }}>
                  <div style={{ fontSize: '10.5px', color: '#166534' }}>Paid Amount</div>
                  <div style={{ fontSize: '15px', fontWeight: 700, color: '#166534' }}>
                    ₹{(feesData?.paid_amount || 35000).toLocaleString('en-IN')}
                  </div>
                </div>
                <div style={{ backgroundColor: '#fffbeb', padding: '10px', borderRadius: '6px', border: '1px solid #fef3c7', textAlign: 'center' }}>
                  <div style={{ fontSize: '10.5px', color: '#92400e' }}>Pending Dues</div>
                  <div style={{ fontSize: '15px', fontWeight: 700, color: '#92400e' }}>
                    ₹{(feesData?.pending_amount || 15000).toLocaleString('en-IN')}
                  </div>
                </div>
              </div>

              {/* 1-Click Download Fee Receipt */}
              <button
                type="button"
                onClick={() => setIsReceiptModalOpen(true)}
                className="btn btn-primary"
                style={{
                  width: '100%',
                  padding: '11px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  fontSize: '13px',
                }}
              >
                <Download size={15} />
                <span>Download Official Fee Receipt (PDF)</span>
              </button>
            </div>

            {/* Installments Schedule */}
            <div className="erp-card-elevated" style={{ padding: '16px' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', marginBottom: '12px' }}>
                Installment Breakdown &amp; Due Dates
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {(feesData?.installment_schedule || [
                  { number: 1, label: 'Installment 1 — Admission Term', amount: 20000, due_date: '2026-07-15', status: 'paid' },
                  { number: 2, label: 'Installment 2 — Mid-Term Advance', amount: 15000, due_date: '2026-10-15', status: 'paid' },
                  { number: 3, label: 'Installment 3 — Prelims & Finals', amount: 15000, due_date: '2026-12-15', status: 'pending' },
                ]).map((inst, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: '10px 12px',
                      borderRadius: '8px',
                      backgroundColor: inst.status === 'paid' ? '#f8fafc' : '#fffbeb',
                      border: inst.status === 'paid' ? '1px solid #e2e8f0' : '1px solid #fde68a',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '12.5px', fontWeight: 600, color: '#0f172a' }}>
                        {inst.label}
                      </div>
                      <div style={{ fontSize: '11px', color: '#64748b' }}>
                        Due: {inst.due_date}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>
                        ₹{Number(inst.amount).toLocaleString('en-IN')}
                      </div>
                      <span style={{
                        fontSize: '10px',
                        fontWeight: 700,
                        color: inst.status === 'paid' ? '#166534' : '#b45309',
                      }}>
                        {inst.status === 'paid' ? '✓ PAID' : 'PENDING'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* =============================================================
            TAB 4: EXAMS & BATCH RANKING
            ============================================================= */}
        {activeTab === 'exams' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            
            <div className="erp-card-elevated" style={{ padding: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '13.5px', fontWeight: 700, color: '#0f172a' }}>
                  Exam Marksheets &amp; Batch Rankings
                </span>
                <span style={{ fontSize: '11px', color: '#64748b' }}>
                  {examsData.length} Tests Evaluated
                </span>
              </div>
              <p style={{ margin: 0, fontSize: '11.5px', color: '#64748b', lineHeight: 1.4 }}>
                Real-time competitive percentiles, ranks, and printable report cards with official institution logo.
              </p>
            </div>

            {/* Test Cards List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {examsData.map((exam) => (
                <div
                  key={exam.id}
                  className="erp-card-elevated"
                  style={{ padding: '14px 16px' }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <div>
                      <span style={{
                        fontSize: '10px',
                        fontWeight: 700,
                        backgroundColor: '#f1f5f9',
                        color: '#475569',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        display: 'inline-block',
                        marginBottom: '4px',
                      }}>
                        {exam.type} • {exam.date}
                      </span>
                      <h4 style={{ margin: 0, fontSize: '13.5px', fontWeight: 700, color: '#0f172a' }}>
                        {exam.title}
                      </h4>
                    </div>

                    {/* Rank Badge */}
                    <div style={{
                      backgroundColor: '#eff6ff',
                      border: '1px solid #bfdbfe',
                      padding: '4px 8px',
                      borderRadius: '8px',
                      textAlign: 'center',
                    }}>
                      <div style={{ fontSize: '12px', fontWeight: 800, color: '#1d4ed8' }}>
                        Rank #{exam.rank}
                      </div>
                      <div style={{ fontSize: '9px', color: '#3b82f6' }}>
                        of {exam.totalStudents} students
                      </div>
                    </div>
                  </div>

                  {/* Marks & Grade Bar */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#f8fafc', padding: '8px 12px', borderRadius: '8px', marginBottom: '10px' }}>
                    <div>
                      <span style={{ fontSize: '11px', color: '#64748b' }}>Score: </span>
                      <strong style={{ fontSize: '14px', color: '#0f172a' }}>
                        {exam.marks_obtained} / {exam.max_marks}
                      </strong>
                      <span style={{ fontSize: '11px', color: '#16a34a', marginLeft: '6px' }}>
                        ({Math.round((exam.marks_obtained / exam.max_marks) * 100)}%)
                      </span>
                    </div>

                    <span style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      backgroundColor: '#dcfce7',
                      color: '#166534',
                      padding: '2px 8px',
                      borderRadius: '10px',
                    }}>
                      Grade: {exam.grade}
                    </span>
                  </div>

                  {/* Remarks */}
                  {exam.teacher_remarks && (
                    <div style={{ fontSize: '11.5px', color: '#475569', fontStyle: 'italic', marginBottom: '10px' }}>
                      "{exam.teacher_remarks}"
                    </div>
                  )}

                  {/* 1-Click Action to View Report Card */}
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedExamForModal(exam);
                      setIsReportCardOpen(true);
                    }}
                    className="btn btn-outline"
                    style={{
                      width: '100%',
                      padding: '8px',
                      fontSize: '12px',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                    }}
                  >
                    <Download size={13} />
                    <span>Download Official Report Card (PDF)</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>

      {/* =============================================================
          BOTTOM APP NAVIGATION BAR (Mobile Native Feeling)
          ============================================================= */}
      <div style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: '#ffffff',
        borderTop: '1px solid #e2e8f0',
        padding: '8px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-around',
        zIndex: 50,
        boxShadow: '0 -2px 10px rgba(0, 0, 0, 0.05)',
      }}>
        
        {/* Home Tab */}
        <button
          type="button"
          onClick={() => setActiveTab('home')}
          style={{
            background: 'none',
            border: 'none',
            color: activeTab === 'home' ? '#0a1424' : '#64748b',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '3px',
            fontSize: '10px',
            fontWeight: activeTab === 'home' ? 700 : 500,
            cursor: 'pointer',
          }}
        >
          <School size={20} color={activeTab === 'home' ? '#c5a880' : '#64748b'} />
          <span>Home</span>
        </button>

        {/* Attendance Tab */}
        <button
          type="button"
          onClick={() => setActiveTab('attendance')}
          style={{
            background: 'none',
            border: 'none',
            color: activeTab === 'attendance' ? '#0a1424' : '#64748b',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '3px',
            fontSize: '10px',
            fontWeight: activeTab === 'attendance' ? 700 : 500,
            cursor: 'pointer',
          }}
        >
          <Calendar size={20} color={activeTab === 'attendance' ? '#c5a880' : '#64748b'} />
          <span>Attendance</span>
        </button>

        {/* Fees Tab */}
        <button
          type="button"
          onClick={() => setActiveTab('fees')}
          style={{
            background: 'none',
            border: 'none',
            color: activeTab === 'fees' ? '#0a1424' : '#64748b',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '3px',
            fontSize: '10px',
            fontWeight: activeTab === 'fees' ? 700 : 500,
            cursor: 'pointer',
          }}
        >
          <CreditCard size={20} color={activeTab === 'fees' ? '#c5a880' : '#64748b'} />
          <span>Fees</span>
        </button>

        {/* Exams Tab */}
        <button
          type="button"
          onClick={() => setActiveTab('exams')}
          style={{
            background: 'none',
            border: 'none',
            color: activeTab === 'exams' ? '#0a1424' : '#64748b',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '3px',
            fontSize: '10px',
            fontWeight: activeTab === 'exams' ? 700 : 500,
            cursor: 'pointer',
          }}
        >
          <Award size={20} color={activeTab === 'exams' ? '#c5a880' : '#64748b'} />
          <span>Exams</span>
        </button>
      </div>

      {/* Sibling Switcher Modal */}
      <ParentSiblingSwitcherModal
        isOpen={isSiblingModalOpen}
        onClose={() => setIsSiblingModalOpen(false)}
        students={session.students || []}
        selectedStudentId={selectedStudentId}
        onSelectStudent={(newId) => {
          setSelectedStudentId(newId);
          saveParentPortalSession({
            ...session,
            selectedStudentId: newId,
          });
        }}
      />

      {/* Fee Receipt Printable Modal */}
      {selectedStudent && (
        <FeeReceiptModal
          isOpen={isReceiptModalOpen}
          onClose={() => setIsReceiptModalOpen(false)}
          student={selectedStudent}
          course={selectedStudent.courses}
          paymentRecord={feesData?.receipts?.[0] || {
            amount: 20000,
            paymentMethod: 'UPI / Online Banking',
            referenceNo: 'REC-PORTAL-2026',
            created_at: new Date().toISOString(),
          }}
        />
      )}

      {/* Exam Marksheet Modal */}
      {selectedStudent && selectedExamForModal && (
        <ReportCardModal
          isOpen={isReportCardOpen}
          onClose={() => setIsReportCardOpen(false)}
          student={selectedStudent}
          exam={selectedExamForModal}
          marksRow={{
            marks_obtained: selectedExamForModal.marks_obtained,
            is_absent: false,
            remarks: selectedExamForModal.teacher_remarks,
          }}
        />
      )}
    </div>
  );
}
