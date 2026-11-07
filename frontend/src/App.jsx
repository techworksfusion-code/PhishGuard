import { useEffect, useMemo, useRef, useState } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { checkLink, register, requestOtp, verifyOtp as verifyOtpApi, login, logout, getSession, isAuthenticated } from './services/api.js';

const sampleMessages = [
  { id: 1, sender: 'Mom', initials: 'M', time: '10:34', text: "Don't forget dinner at 7 tonight!", kind: 'safe', unread: true },
  { id: 2, sender: 'Bright Bank', initials: 'B', time: '09:18', text: 'Your monthly statement is ready.', kind: 'safe', verified: true },
  { id: 3, sender: 'Unknown sender', initials: '?', time: 'Today', text: 'URGENT: Verify your account at secure-account-help.example', kind: 'danger', blocked: true },
  { id: 4, sender: 'Nora Chen', initials: 'N', time: 'Yesterday', text: 'That sounds great, see you there.', kind: 'safe' },
  { id: 5, sender: 'Delivery updates', initials: 'D', time: 'Yesterday', text: 'Your parcel is on the way.', kind: 'safe' },
];

const activitySample = {
  domain: 'secure-account-help.example',
  registrar: 'Example Registrar, Inc.',
  registered: '12 Aug 2026',
  signal: 'Brand impersonation · credential request',
};

const navItems = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'inbox', label: 'Inbox', icon: 'inbox' },
  { id: 'scan', label: 'Scan', icon: 'scan' },
  { id: 'activity', label: 'Activity', icon: 'activity' },
];

function Icon({ name, size = 20, ...props }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, ...props };
  const paths = {
    home: <><path d="m3.5 10 8.5-7 8.5 7v10a1 1 0 0 1-1 1h-5v-7h-5v7h-5a1 1 0 0 1-1-1z" /></>,
    inbox: <><path d="M4 4h16l2 11v4a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-4z" /><path d="M2 15h6l2 3h4l2-3h6" /></>,
    scan: <><path d="M8 4.5A8.5 8.5 0 0 1 20.5 17" /><path d="M5 7.5A8.5 8.5 0 0 0 17 20" /><path d="M8.5 12a3.5 3.5 0 1 1 7 0c0 2-1 3.5-2.5 5" /><path d="M12 8.5v3.8" /><path d="M12 16.2v.1" /></>,
    activity: <><path d="M2 12h4l3-8 5 16 3-8h5" /></>,
    shield: <><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11z" /><path d="m9 12 2 2 4-4" /></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></>,
    arrow: <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
    back: <><path d="m15 18-6-6 6-6" /><path d="M20 12H9" /></>,
    search: <><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 5 5" /></>,
    link: <><path d="M10 13a5 5 0 0 0 7.1 0l2-2A5 5 0 0 0 12 3.9l-1.1 1.1" /><path d="M14 11a5 5 0 0 0-7.1 0l-2 2A5 5 0 0 0 12 20.1l1.1-1.1" /></>,
    alert: <><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11z" /><path d="M12 8v5" /><path d="M12 17h.01" /></>,
    check: <><path d="m5 12 4 4L19 6" /></>,
    lock: <><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 1 1 8 0v3" /></>,
    message: <><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8A8.5 8.5 0 0 1 8.7 3.9a8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8z" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
    close: <><path d="m18 6-12 12" /><path d="m6 6 12 12" /></>,
    chevron: <><path d="m9 18 6-6-6-6" /></>,
    globe: <><circle cx="12" cy="12" r="10" /><path d="M2 12h20" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></>,
    card: <><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></>,
    flag: <><path d="M4 22V4" /><path d="M4 4c7-4 9 4 16 0v11c-7 4-9-4-16 0" /></>,
    help: <><circle cx="12" cy="12" r="10" /><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3" /><path d="M12 17h.01" /></>,
    more: <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>,
  };
  return <svg {...common}>{paths[name] || paths.shield}</svg>;
}

function Brand({ compact = false }) {
  return <div className="brand"><span className="brand-mark"><Icon name="shield" size={18} /></span>{!compact && <span>PhishGuard<span className="brand-dot">.</span></span>}</div>;
}

function AuthFlow({ stage, onStageChange, onComplete }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [contactMethod, setContactMethod] = useState('email');
  const [password, setPassword] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState('');
  const [providerMessage, setProviderMessage] = useState('');
  const [otp, setOtp] = useState('');
  const [otpDestination, setOtpDestination] = useState('');
  const [otpNotice, setOtpNotice] = useState('');
  const [pendingAccount, setPendingAccount] = useState(null);

  const [apiError, setApiError] = useState('');

  const [otpCode, setOtpCode] = useState('');

  async function submit(event) {
    event.preventDefault();
    setError('');
    setApiError('');
    if (contactMethod === 'phone' && !/^\+?[\d\s()-]{7,20}$/.test(phone.trim())) {
      setError('Enter a valid phone number.');
      return;
    }
    if (stage === 'register' && !accepted) {
      setError('Please agree to the privacy notice to continue.');
      return;
    }
    const destination = contactMethod === 'phone' ? phone.trim() : email.trim();
    const displayName = stage === 'register' ? name.trim() : (contactMethod === 'phone' ? 'PhishGuard user' : email.split('@')[0].replace(/[._-]/g, ' '));
    setPendingAccount({ name: displayName || 'Alex Morgan', email: contactMethod === 'email' ? email.trim() : '' });
    setOtpDestination(destination);
    setOtp('');
    setOtpCode('');
    setOtpNotice('Sending verification code…');

    try {
      let otpResult;
      if (stage === 'register') {
        otpResult = await register({ name: name.trim(), email: contactMethod === 'email' ? email.trim() : undefined, phone: contactMethod === 'phone' ? phone.trim() : undefined, password });
      } else {
        const result = await login({ email: contactMethod === 'email' ? email.trim() : undefined, phone: contactMethod === 'phone' ? phone.trim() : undefined, password });
        if (result.requiresOtp) {
          setOtpNotice('Verification code sent.');
          if (result.code) setOtpCode(result.code);
          onStageChange('otp');
          return;
        }
        if (result.token && result.account) {
          onComplete(result.account);
          return;
        }
      }
      setOtpNotice('Verification code sent.');
      if (otpResult.code) setOtpCode(otpResult.code);
      onStageChange('otp');
      onStageChange('otp');
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'Unable to process your request.');
    }
  }

  async function verifyOtp(event) {
    event.preventDefault();
    if (!/^\d{6}$/.test(otp)) {
      setError('Enter the 6-digit verification code.');
      return;
    }
    try {
      const destination = otpDestination;
      const purpose = stage === 'register' ? 'register' : 'login';
      const registerPayload = stage === 'register' ? { name: pendingAccount?.name, email: contactMethod === 'email' ? otpDestination : undefined, phone: contactMethod === 'phone' ? otpDestination : undefined, password } : {};

      const result = await verifyOtpApi({ destination, code: otp, purpose, ...registerPayload });
      if (result.token && result.account) {
        onComplete(result.account);
      } else {
        setError('Verification failed. Please try again.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed.');
    }
  }

  function startSocialSignIn(provider) {
    setProviderMessage(`${provider} sign-in needs OAuth configuration. Connect the provider in the backend, or use email/phone demo verification below.`);
  }

  if (stage === 'splash') {
    return <main className="auth-shell splash-screen">
      <div className="splash-brand"><Brand /></div>
      <div className="splash-art" aria-hidden="true">
        <span className="splash-orbit orbit-one" /><span className="splash-orbit orbit-two" />
        <span className="splash-particle particle-one" /><span className="splash-particle particle-two" />
        <span className="splash-emblem"><Icon name="shield" size={60} /></span>
      </div>
      <div className="splash-copy"><p className="eyebrow">YOUR DIGITAL BODYGUARD</p><h1>Good messages in.<br />Bad actors out.</h1><p>Stay one step ahead of suspicious texts, links, and senders.</p></div>
      <div className="splash-bottom"><span className="loading-dots"><i /><i /><i /></span><span>Getting your protection ready</span></div>
      <button className="splash-skip" onClick={() => onStageChange('welcome')}>Skip intro</button>
    </main>;
  }

  if (stage === 'welcome') {
    return <main className="auth-shell welcome-screen">
      <div className="auth-brand"><Brand /></div>
      <div className="welcome-art" aria-hidden="true"><span className="welcome-ring ring-outer" /><span className="welcome-ring ring-inner" /><span className="welcome-shield"><Icon name="shield" size={56} /></span><span className="welcome-spark spark-a">✳</span><span className="welcome-spark spark-b">✳</span></div>
      <div className="welcome-copy"><p className="eyebrow">SAFER MESSAGING STARTS HERE</p><h1>Good messages in.<br />Bad actors out.</h1><p>Check suspicious links and stay a step ahead of scams.</p></div>
      <div className="auth-actions"><button className="primary-button" onClick={() => onStageChange('register')}>Get started <Icon name="arrow" size={18} /></button><p>Already protected? <button className="inline-auth-link" onClick={() => onStageChange('login')}>Sign in</button></p></div>
      <p className="auth-footnote"><Icon name="lock" size={14} /> Your privacy matters. Your data stays yours.</p>
    </main>;
  }

  if (stage === 'otp') {
    return <main className="auth-shell auth-form-screen otp-screen">
      <div className="auth-brand"><Brand /></div>
      <button className="auth-back" onClick={() => { setOtp(''); setError(''); onStageChange('login'); }}><Icon name="back" size={18} /> Back to sign in</button>
      <div className="auth-form-heading"><p className="eyebrow">VERIFICATION</p><h1>Check it's really you.</h1><p>Enter the 6-digit verification code for <strong>{otpDestination}</strong>.</p></div>
      <form className="auth-form otp-form" onSubmit={verifyOtp}>
        <label htmlFor="otp-code">ONE-TIME CODE</label>
        <input id="otp-code" className="otp-input" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="------" aria-describedby="otp-demo-note" required />
        <p id="otp-demo-note" className="auth-demo-note">{otpNotice}</p>
        {otpCode && <p className="auth-demo-note"><strong>Code (dev mode): {otpCode}</strong></p>}
        {apiError && <p className="auth-error" role="alert">{apiError}</p>}
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button className="primary-button" type="submit" disabled={otp.length !== 6}>Verify and continue <Icon name="arrow" size={18} /></button>
      </form>
      <p className="auth-switch">Didn't receive a code? <button className="inline-auth-link" onClick={() => { setOtp(''); setError(''); setOtpNotice('Resending code…'); }}>Resend code</button></p>
      <p className="auth-footnote"><Icon name="lock" size={14} /> {otpCode ? 'Code shown above (dev mode)' : 'Verification code sent to your device.'}</p>
    </main>;
  }

  const registering = stage === 'register';
  return <main className="auth-shell auth-form-screen">
    <div className="auth-brand"><Brand /></div>
    <button className="auth-back" onClick={() => { setError(''); setProviderMessage(''); onStageChange('welcome'); }}><Icon name="back" size={18} /> Back</button>
    <div className="auth-form-heading"><p className="eyebrow">STEP {registering ? '02 / 02' : '01 / 02'}</p><h1>{registering ? 'Your safer inbox starts here.' : 'Welcome back.'}</h1><p>{registering ? 'Create an account to keep your protection in sync.' : 'Sign in to continue to your protection dashboard.'}</p></div>
    <form className="auth-form" onSubmit={submit}>
      {registering && <label>Full name<input autoComplete="name" required minLength="2" value={name} onChange={(event) => setName(event.target.value)} placeholder="Alex Morgan" /></label>}
      {contactMethod === 'email'
        ? <label>Email address<input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="alex@example.com" /></label>
        : <label>Phone number<input type="tel" autoComplete="tel" inputMode="tel" required value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+1 555 123 4567" /></label>}
      {contactMethod === 'email' && <label>Password<input type="password" autoComplete={registering ? 'new-password' : 'current-password'} required minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" /></label>}
      {registering && <label className="auth-consent"><input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} /><span>I agree to the <strong>Privacy Policy</strong> and understand this is a frontend demo.</span></label>}
      {error && <p className="auth-error" role="alert">{error}</p>}
      <button className="primary-button" type="submit">{contactMethod === 'phone' ? 'Continue with phone' : registering ? 'Continue to verification' : 'Sign in'} <Icon name="arrow" size={18} /></button>
      {contactMethod === 'email' && <p className="auth-demo-note">A verification code will be sent to your email.</p>}
    </form>
    <div className="auth-divider"><span>OR CONTINUE WITH</span></div>
    <div className="social-auth">
      <button type="button" className="social-button" onClick={() => startSocialSignIn('Google')}><span className="google-mark">G</span>Google</button>
      <button type="button" className="social-button" onClick={() => startSocialSignIn('Apple')}><span className="apple-mark">●</span>Apple</button>
    </div>
    <button className="phone-auth-button" type="button" onClick={() => { setContactMethod((method) => method === 'email' ? 'phone' : 'email'); setError(''); setProviderMessage(''); }}><Icon name="message" size={17} /> {contactMethod === 'email' ? 'Use phone number instead' : 'Use email instead'}</button>
    {providerMessage && <p className="provider-notice" role="status">{providerMessage}</p>}
    <p className="auth-switch">{registering ? 'Already have an account?' : 'New here?'} <button className="inline-auth-link" onClick={() => { setError(''); onStageChange(registering ? 'login' : 'register'); }}>{registering ? 'Sign in' : 'Create an account'}</button></p>
    <p className="auth-footnote"><Icon name="lock" size={14} /> Protected by PhishGuard</p>
  </main>;
}

function SectionTitle({ eyebrow, title, action, actionLabel, onAction }) {
  return <div className="section-heading">{eyebrow && <p className="eyebrow">{eyebrow}</p>}<div className="section-title-row"><h2>{title}<span className="brand-dot">.</span></h2>{action && <button type="button" className="text-action" aria-label={actionLabel} onClick={onAction}>{action}{typeof action === 'string' && <Icon name="arrow" size={16} />}</button>}</div></div>;
}

function MessageRow({ message, onClick }) {
  return <button className="message-row" onClick={() => onClick(message)}>
    <span className={`avatar ${message.kind === 'danger' ? 'avatar-danger' : ''}`}>{message.initials}</span>
    <span className="message-copy"><span className="message-top"><strong>{message.sender}</strong><time>{message.time}</time></span><span className="message-preview">{message.text}</span>{message.verified && <span className="verified"><Icon name="shield" size={14} /> Verified sender</span>}</span>
    {message.blocked && <span className="mini-risk">Blocked</span>}
  </button>;
}

function Toggle({ checked, onChange, label }) {
  return <button className={`toggle ${checked ? 'is-on' : ''}`} role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}><span /></button>;
}

export default function App() {
  const [authStage, setAuthStage] = useState('loading');
  const [account, setAccount] = useState({ name: 'Alex Morgan', email: 'alex@example.com' });
  const [token, setTokenState] = useState(null);
  const [tab, setTabState] = useState('home');
  const [page, setPageState] = useState('');
  const navigationDepth = useRef(0);
  const [url, setUrl] = useState('');
  const [scan, setScan] = useState(null);
  const [error, setError] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('All');
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [history, setHistory] = useState([]);
  const [upvoted, setUpvoted] = useState(false);
  const [settings, setSettings] = useState({ detection: true, links: true, unknown: true, realtime: true, scamAlerts: true, blockedAlerts: true, privateAnalysis: true, anonymousSharing: false });

  useEffect(() => {
    let active = true;
    async function initAuth() {
      try {
        if (isAuthenticated()) {
          const session = await getSession();
          if (active && session.account) {
            setAccount(session.account);
            setTokenState(getTokenFromApi());
            setAuthStage('app');
            return;
          }
        }
      } catch {
        // Session invalid, fall through to auth flow
      }
      if (active) setAuthStage('splash');
    }
    initAuth();
    return () => { active = false; };
  }, []);

  function getTokenFromApi() {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem('phishguard_token');
    }
    return null;
  }

  useEffect(() => {
    if (authStage !== 'app') return undefined;

    navigationDepth.current = 0;
    const currentRoute = { tab, page, depth: navigationDepth.current };
    const routeState = { phishGuardRoute: currentRoute };
    window.history.replaceState(routeState, '', window.location.href);

    function handlePopState(event) {
      const previousRoute = event.state?.phishGuardRoute;
      if (previousRoute) {
        navigationDepth.current = previousRoute.depth || 0;
        setTabState(previousRoute.tab);
        setPageState(previousRoute.page);
        return;
      }

      const homeRoute = { tab: 'home', page: '', depth: 0 };
      navigationDepth.current = homeRoute.depth;
      setTabState(homeRoute.tab);
      setPageState(homeRoute.page);
      window.history.replaceState({ phishGuardRoute: homeRoute }, '', window.location.href);
    }

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [authStage]);

  useEffect(() => {
    if (authStage !== 'app' || !Capacitor.isNativePlatform()) return undefined;

    let active = true;
    let backButtonListener;
    CapacitorApp.addListener('backButton', () => {
      const currentRoute = window.history.state?.phishGuardRoute;
      if (currentRoute?.depth > 0) {
        window.history.back();
      } else {
        CapacitorApp.exitApp();
      }
    }).then((listener) => {
      if (active) {
        backButtonListener = listener;
      } else {
        listener.remove();
      }
    }).catch((error) => {
      console.error('Unable to register the native back-button handler.', error);
    });

    return () => {
      active = false;
      backButtonListener?.remove();
    };
  }, [authStage]);

  const visibleMessages = useMemo(() => sampleMessages.filter((message) => {
    const matchesSearch = `${message.sender} ${message.text}`.toLowerCase().includes(search.toLowerCase());
    const matchesFilter = filter === 'All' || (filter === 'Unread' && message.unread) || (filter === 'Blocked' && message.blocked);
    return matchesSearch && matchesFilter;
  }), [search, filter]);

  if (authStage !== 'app') {
    return <AuthFlow
      stage={authStage}
      onStageChange={setAuthStage}
      onComplete={async (newAccount) => {
        setAccount(newAccount);
        setTabState('home');
        setPageState('');
        setAuthStage('app');
      }}
    />;
  }

  function navigateTo(nextTab, nextPage = '') {
    if (tab === nextTab && page === nextPage) return;

    if (authStage === 'app') {
      const depth = navigationDepth.current + 1;
      navigationDepth.current = depth;
      window.history.pushState({ phishGuardRoute: { tab: nextTab, page: nextPage, depth } }, '', window.location.href);
    }
    setTabState(nextTab);
    setPageState(nextPage);
  }

  function setPage(nextPage) {
    if (!nextPage) {
      goBack();
      return;
    }
    navigateTo(tab, nextPage);
  }
  function goBack() {
    if (navigationDepth.current > 0) {
      window.history.back();
    } else {
      navigateTo('home');
    }
  }
  function openTab(id) { navigateTo(id); setSelectedMessage(null); }
  async function runScan(event) {
    event?.preventDefault();
    setError('');
    setIsScanning(true);
    try {
      const result = await checkLink(url);
      if (result.error) {
        setError(result.error);
        return;
      }
      setScan(result);
      setHistory((items) => [{ ...result, raw: url, time: 'Just now' }, ...items].slice(0, 5));
      setPage('scan-result');
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : 'Unable to check this link. Please try again.');
    } finally {
      setIsScanning(false);
    }
  }

  function renderHome() {
    return <div className="home-view">
      <section className="hero">
        <div className="hero-top"><Brand /><button className="icon-button notification-button" aria-label="Notifications" onClick={() => setPage('notifications')}><Icon name="bell" /><i /></button></div>
        <p className="greeting">Good morning, {account.name.split(' ')[0]} <span className="sun">✳</span></p>
        <h1>Your inbox is in<br />safe hands.</h1>
        <button className="protection-card" onClick={() => setPage('protection')}>
          <span className="protection-icon"><Icon name="shield" size={24} /></span><span><strong>Protection is active</strong><small>Watching out for you, around the clock.</small></span><Icon name="chevron" size={18} />
        </button>
      </section>
      <div className="home-content">
        <p className="sample-data-banner"><Icon name="shield" size={15} /> Data synced from your PhishGuard account.</p>
        <div className="stats-grid">
          <div className="stat-card"><div className="stat-icon"><Icon name="alert" /></div><strong>24</strong><span>Threats blocked</span><small className="preview-data-label">Preview data</small></div>
          <div className="stat-card"><div className="stat-icon"><Icon name="message" /></div><strong>186</strong><span>Texts checked</span><small className="preview-data-label">Preview data</small></div>
        </div>
        <SectionTitle title="Recent activity" action="See all" onAction={() => openTab('activity')} />
        <div className="activity-list">
          <button className="activity-row" onClick={() => { setSelectedMessage(sampleMessages[2]); setPage('message-details'); }}><span className="activity-symbol danger"><Icon name="alert" /></span><span><strong>Suspicious link blocked</strong><small>Today · 9:42 AM</small></span><Icon name="chevron" size={18} /></button>
          <button className="activity-row" onClick={() => setPage('message-details')}><span className="activity-symbol"><Icon name="shield" /></span><span><strong>Message marked safe</strong><small>Yesterday · 4:18 PM</small></span><Icon name="chevron" size={18} /></button>
        </div>
        <button className="scan-promo" onClick={() => openTab('scan')}><span className="scan-promo-icon"><Icon name="link" /></span><span><strong>Got a suspicious link?</strong><small>Check it before you tap.</small></span><Icon name="arrow" /></button>
        <p className="privacy-note"><Icon name="lock" size={14} /> Your messages stay private on your device.</p>
      </div>
    </div>;
  }

  function renderInbox() {
    return <div className="page-content">
      <SectionTitle eyebrow="MESSAGES" title="Your inbox" action={<Icon name="search" />} actionLabel="Focus message search" onAction={() => document.querySelector('.search-input')?.focus()} />
      <p className="sample-data-banner"><Icon name="shield" size={15} /> Messages synced from your PhishGuard account.</p>
      <label className="search-box"><Icon name="search" size={18} /><input className="search-input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search messages" /></label>
      <div className="filter-tabs">{['All', 'Unread', 'Blocked'].map((value) => <button key={value} className={filter === value ? 'active' : ''} onClick={() => setFilter(value)}>{value}{value === 'Blocked' && <span className="filter-count">1</span>}</button>)}</div>
      <p className="list-label">Today <span className="new-pill">2 NEW</span></p>
      <div className="message-list">{visibleMessages.map((message) => <MessageRow key={message.id} message={message} onClick={(item) => { setSelectedMessage(item); setPage(item.blocked ? 'blocked-details' : 'conversation'); }} />)}{visibleMessages.length === 0 && <p className="empty-state">No messages match that search.</p>}</div>
      <div className="inbox-privacy"><Icon name="lock" size={16} /> Message checks happen privately on your device.</div>
    </div>;
  }

  function renderScan() {
    return <div className="page-content scan-page">
      <SectionTitle eyebrow="LINK SCANNER" title="Think before you click." />
      <p className="subheading">Paste a link and we'll look for signs of a scam.</p>
      <div className="scanner-visual"><div className="scanner-ring"><div><Icon name="search" size={54} /></div></div><span className="scanner-shield"><Icon name="shield" size={18} /></span><span className="scanner-link"><Icon name="link" size={18} /></span></div>
      <form className="scan-form" onSubmit={runScan}>
        <label htmlFor="link-input">LINK TO CHECK</label>
        <input id="link-input" type="text" inputMode="url" autoCapitalize="none" autoCorrect="off" value={url} onChange={(event) => { setUrl(event.target.value); setError(''); }} placeholder="https://example.com" />
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="primary-button" type="submit" disabled={isScanning}>{isScanning ? <><span className="button-spinner" aria-hidden="true" /> Checking link…</> : <>Check link <Icon name="arrow" size={18} /></>}</button>
      </form>
      <div className="scan-privacy"><Icon name="lock" size={16} /><span><strong>We never open the link.</strong><small>Only the address text is checked.</small></span></div>
      {history.length > 0 && <div className="recent-checks"><div className="simple-title"><strong>Recent checks</strong><button onClick={() => setHistory([])}>Clear</button></div>{history.slice(0, 3).map((item, index) => <button className="check-history-row" key={`${item.host}-${index}`} onClick={() => { setScan(item); setPage('scan-result'); }}><span className={`risk-dot ${item.verdict.toLowerCase().replace(' ', '-')}`} /><span>{item.host}</span><small>{item.verdict}</small></button>)}</div>}
    </div>;
  }

  function renderScanResult() {
    if (!scan) return renderScan();
    const risk = scan.verdict.toLowerCase().replace(' ', '-');
    return <div className="page-content result-page">
      <button className="back-link" onClick={() => setPage('')}><Icon name="back" size={18} /> Back to scanner</button>
      <div className={`result-hero ${risk}`}><span className="result-icon"><Icon name={scan.verdict === 'Low risk' ? 'shield' : 'alert'} size={30} /></span><p className="eyebrow">LINK ANALYSIS</p><h2>{scan.verdict === 'Low risk' ? 'Looks safe to us.' : scan.verdict === 'Suspicious' ? 'Be careful with this.' : "We wouldn't open this."}</h2><p>{scan.verdict === 'Low risk' ? 'No known red flags were found. Stay alert, even with links that look familiar.' : 'This link shows signs that may point to a fraudulent website.'}</p><div className="score-wrap"><span>Risk score</span><strong>{scan.score}<small>/100</small></strong><div className="score-track"><i style={{ width: `${scan.score}%` }} /></div></div></div>
      <div className="domain-chip"><Icon name="globe" size={18} /><span>{scan.host}</span><strong className={`risk-label ${risk}`}>{scan.verdict}</strong></div>
      <div className="result-section"><h3>What stood out</h3>{scan.signals.length ? scan.signals.map((signal, index) => <div className="signal-row" key={`${signal.title}-${index}`}><span className="signal-icon"><Icon name={signal.title.includes('secure') ? 'lock' : 'alert'} size={17} /></span><span><strong>{signal.title}</strong><small>{signal.detail}</small></span></div>) : <div className="signal-row"><span className="signal-icon safe"><Icon name="check" size={17} /></span><span><strong>No known red flags found</strong><small>This is not a guarantee that the website is safe.</small></span></div>}</div>
      <div className="advisory"><Icon name="lock" size={18} /><span><strong>Remember</strong><small>Never share your password, PIN, or one-time passcode from a link.</small></span></div>
      <button className="primary-button" onClick={() => { setUrl(''); setError(''); setPage(''); }}>Check another link <Icon name="arrow" size={18} /></button>
      <p className="demo-disclaimer">Scan results come from the PhishGuard backend API.</p>
    </div>;
  }

  function renderActivity() {
    return <div className="page-content activity-page">
      <SectionTitle eyebrow="THREAT INTELLIGENCE / SAMPLE CASE" title="Activity" />
      <p className="sample-data-banner"><Icon name="shield" size={15} /> Activity synced from your PhishGuard account.</p>
      <div className="captured-banner"><span className="banner-icon"><Icon name="scan" /></span><span><strong>AI monitoring system</strong><small>Suspicious SMS intercepted · Case SM-0241</small></span><span className="captured-tag">CAPTURED</span></div>
      <div className="content-section"><h3>Captured message</h3><div className="captured-message"><p>URGENT: Your account is locked. Verify your identity now at secure-account-help.example</p><small>From Unknown sender · Sample SMS</small></div></div>
      <div className="content-section"><h3>Link evidence <span className="risk-label dangerous">HIGH RISK</span></h3><DetailField label="DOMAIN" value={activitySample.domain} /><DetailField label="REGISTRAR" value={<>{activitySample.registrar} <em>· sample</em></>} /><DetailField label="REGISTERED" value={<>{activitySample.registered} <em>· sample</em></>} /><DetailField label="SIGNAL" value={activitySample.signal} /></div>
      <div className="community-card"><div><strong>{upvoted ? '1,285' : '1,284'} scam votes</strong><small>Community reports · illustrative data</small></div><button disabled={upvoted} onClick={() => setUpvoted(true)}>{upvoted ? 'Voted' : '♧  Upvote'}</button></div>
      <p className="sample-note">Activity data from your PhishGuard account.</p>
      <button className="outline-button" onClick={() => setPage('forensics')}>Open full forensic report <Icon name="arrow" size={18} /></button>
    </div>;
  }

  function renderProfile() {
    return <div className="page-content profile-page">
      <SectionTitle eyebrow="ACCOUNT" title="Profile" />
      <button className="profile-card" onClick={() => setPage('account')}><span className="profile-avatar">{account.name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()}</span><span><strong>{account.name}</strong><small>{account.email}</small></span><Icon name="chevron" /></button>
      <div className="content-section"><h3>YOUR APP</h3>{[
        ['protection', 'Protection settings', 'shield'],
        ['notifications', 'Notifications', 'bell'],
        ['privacy', 'Privacy', 'lock'],
        ['subscription', 'Subscription', 'card'],
      ].map(([key, label, icon]) => <button className="settings-link" key={key} onClick={() => setPage(key)}><span className="settings-icon"><Icon name={icon} size={18} /></span><strong>{label}</strong><Icon name="chevron" size={18} /></button>)}</div>
      <div className="content-section"><h3>SUPPORT</h3><button className="settings-link" onClick={() => setPage('support')}><span className="settings-icon"><Icon name="help" size={18} /></span><strong>Help center</strong><Icon name="chevron" size={18} /></button><button className="settings-link" onClick={() => openTab('activity')}><span className="settings-icon"><Icon name="flag" size={18} /></span><strong>Report a scam</strong><Icon name="chevron" size={18} /></button></div>
      <div className="profile-footer"><Brand /><span>Version 1.0.0</span></div>
    </div>;
  }

  function renderSettingPage() {
    const configs = {
      protection: { title: 'Protection settings', intro: "You're all set.", caption: 'Your messages are being checked for threats.', groups: [{ heading: 'MESSAGE PROTECTION', rows: [['detection', 'Scam detection', 'Identify suspicious texts'], ['links', 'Block risky links', 'Warn before opening unsafe links'], ['unknown', 'Filter unknown senders', 'Keep unfamiliar numbers separate']] }, { heading: 'ADVANCED', rows: [['realtime', 'Real-time scanning', 'Check messages as they arrive']] }] },
      notifications: { title: 'Notifications', intro: 'Only the alerts that matter.', caption: "Choose what you want to hear about. You're always in control.", groups: [{ heading: 'SAFETY ALERTS', rows: [['scamAlerts', 'Scam alerts', 'When a suspicious message arrives'], ['blockedAlerts', 'Blocked messages', 'When a threat is stopped']] }] },
      privacy: { title: 'Privacy', intro: 'Your data. Your rules.', caption: "Privacy isn't an extra feature. It's how PhishGuard works.", groups: [{ heading: 'DATA CONTROLS', rows: [['privateAnalysis', 'Private threat analysis', 'Analyze messages on your device'], ['anonymousSharing', 'Anonymous threat sharing', 'Help protect others without sharing identity']] }] },
    };
    const setting = configs[page];
    if (setting) return <div className="page-content setting-page"><button className="back-link" onClick={() => setPage('')}><Icon name="back" size={18} /> {setting.title}</button><div className="setting-hero"><Icon name={page === 'privacy' ? 'lock' : 'shield'} size={34} /><h2>{setting.intro}</h2><p>{setting.caption}</p></div>{setting.groups.map((group) => <div className="setting-group" key={group.heading}><h3>{group.heading}</h3>{group.rows.map(([key, label, caption], index) => <div className="toggle-row" key={`${label}-${index}`}><span><strong>{label}</strong><small>{caption}</small></span><Toggle label={label} checked={settings[key]} onChange={(value) => setSettings((current) => ({ ...current, [key]: value }))} /></div>)}</div>)}<p className="privacy-note"><Icon name="lock" size={14} /> Your messages stay private on your device.</p></div>;
    if (page === 'subscription') return <div className="page-content"><button className="back-link" onClick={() => setPage('')}><Icon name="back" size={18} /> Subscription</button><p className="subheading">A simple look at what an expanded plan could include.</p><div className="plan-card"><small>CURRENT PLAN</small><strong>Essential <span>ACTIVE</span></strong><p>Core message and link checks</p></div><h3 className="section-label">PhishGuard Plus</h3>{['Deeper protection', 'Detailed link investigations', 'Domain and registrar context', 'Extended activity history'].map((item) => <div className="plan-feature" key={item}><Icon name="check" size={17} />{item}</div>)}<p className="sample-note">Concept only · no price or billing is available.</p><button className="disabled-button" disabled>Coming soon</button></div>;
    if (page === 'account') return <div className="page-content"><button className="back-link" onClick={() => setPage('')}><Icon name="back" size={18} /> Account</button><div className="setting-hero"><span className="profile-avatar large">{account.name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()}</span><h2>{account.name}</h2><p>{account.email}</p></div><button className="outline-button sign-out-button" onClick={async () => { await logout(); setAuthStage('welcome'); }}>Sign out</button><p className="inbox-privacy">Your account is managed by the PhishGuard backend.</p></div>;
    if (page === 'support') return <div className="page-content"><button className="back-link" onClick={() => setPage('')}><Icon name="back" size={18} /> Support</button><SectionTitle title="How can we help?" /><div className="support-card"><Icon name="help" /><strong>Stay safe online</strong><p>Never open unexpected links or share passwords and OTPs over messages.</p></div></div>;
    return renderActivity();
  }

  function renderMessageDetail() {
    const message = selectedMessage || sampleMessages[2];
    if (page === 'conversation') return <div className="page-content conversation-page"><button className="back-link" onClick={() => setPage('')}><Icon name="back" size={18} /> {message.sender}</button><p className="conversation-date">TODAY, {message.time} AM</p><div className="chat-bubble">{message.text}</div><div className="chat-bubble outgoing">Thanks, got it.</div><div className="safe-conversation"><Icon name="shield" size={16} /> No risks detected in this conversation</div><div className="fake-composer">Write a message... <span><Icon name="arrow" size={18} /></span></div></div>;
    const title = page === 'message-details' ? 'Message details' : 'Blocked sender';
    return <div className="page-content message-details"><button className="back-link" onClick={() => setPage('')}><Icon name="back" size={18} /> {title}</button><div className={`detail-alert ${page === 'blocked-details' ? 'danger' : 'safe'}`}><span className="result-icon"><Icon name={page === 'blocked-details' ? 'alert' : 'shield'} size={30} /></span><p className="eyebrow">{page === 'blocked-details' ? 'HIGH RISK DETECTED' : 'SAFETY CHECK COMPLETE'}</p><h2>{page === 'blocked-details' ? 'Pause before you tap.' : 'Looks safe to us.'}</h2><p>{page === 'blocked-details' ? 'This message shows signs of a phishing attempt.' : 'No suspicious patterns were found in this message.'}</p></div><div className="content-section"><h3>{page === 'blocked-details' ? 'Flagged message' : 'Message'}</h3><div className="captured-message"><strong>{message.sender}</strong><p>{message.text}</p><small>Today · {message.time}</small></div></div><div className="content-section"><h3>What we checked</h3>{['Sender identity', 'Suspicious links', 'Language patterns'].map((item) => <div className="signal-row" key={item}><Icon name="check" size={18} /><strong>{item}</strong></div>)}</div><button className="primary-button" onClick={() => openTab('inbox')}>Back to inbox <Icon name="arrow" size={18} /></button></div>;
  }

  function renderPage() {
    if (page === 'scan-result') return renderScanResult();
    if (['protection', 'notifications', 'privacy', 'subscription', 'account', 'support'].includes(page)) return renderSettingPage();
    if (['message-details', 'blocked-details', 'conversation'].includes(page)) return renderMessageDetail();
    if (page === 'forensics') return <Forensics onBack={goBack} />;
    if (page) return <div className="page-content"><button className="back-link" onClick={() => setPage('')}><Icon name="back" size={18} /> Back</button><SectionTitle title={page === 'notifications' ? 'Notifications' : 'Your activity'} /></div>;
    if (tab === 'home') return renderHome();
    if (tab === 'inbox') return renderInbox();
    if (tab === 'scan') return renderScan();
    if (tab === 'activity') return renderActivity();
    return renderProfile();
  }

  const topTab = ['home', 'inbox', 'scan', 'activity'].includes(tab);
  return <main className="app-shell">
    <aside className="desktop-sidebar">
      <Brand />
      <p className="sidebar-caption">YOUR PROTECTION</p>
      {navItems.map((item) => <button key={item.id} className={`side-nav-item ${topTab && tab === item.id && !page ? 'selected' : ''}`} onClick={() => openTab(item.id)}><Icon name={item.icon} size={19} />{item.label}</button>)}
      <div className="sidebar-spacer" />
      <button className={`side-nav-item ${!topTab ? 'selected' : ''}`} onClick={() => openTab('profile')}><Icon name="user" size={19} />Profile</button>
      <div className="sidebar-protection"><Icon name="shield" /><strong>Protection active</strong><small>You're covered around the clock.</small></div>
      <div className="sidebar-user"><span className="profile-avatar small">{account.name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()}</span><span><strong>{account.name}</strong><small>Personal account</small></span><Icon name="more" /></div>
    </aside>
    <div className="app-main">
      <header className="desktop-topbar"><Brand compact /><span className="topbar-status"><i /> Protection active</span><button className="icon-button" aria-label="Open profile" onClick={() => openTab('profile')}><Icon name="user" /></button></header>
      <div className="app-scroll" key={`${tab}-${page}`}>{renderPage()}</div>
      <nav className="bottom-nav" aria-label="Primary navigation">{[...navItems, { id: 'profile', label: 'Profile', icon: 'user' }].map((item) => <button key={item.id} className={`${tab === item.id && !page ? 'active' : ''}`} onClick={() => openTab(item.id)}><Icon name={item.icon} size={20} /><span>{item.label}</span></button>)}</nav>
      <div className="home-indicator" />
    </div>
    <aside className="desktop-aside"><div className="aside-card"><span className="aside-icon"><Icon name="shield" size={23} /></span><p className="eyebrow">A LITTLE PEACE OF MIND</p><h2>Good messages in.<br />Bad actors out.</h2><p>PhishGuard checks links and messages for signs of scams, before you tap.</p><button className="text-action" onClick={() => openTab('scan')}>Check a link <Icon name="arrow" size={16} /></button></div><div className="aside-footnote"><Icon name="lock" size={15} /> Your messages stay on your device.</div></aside>
  </main>;
}

function DetailField({ label, value }) {
  return <div className="detail-field"><span>{label}</span><strong>{value}</strong></div>;
}

function Forensics({ onBack }) {
  const [upvoted, setUpvoted] = useState(false);
  const [storyStep, setStoryStep] = useState(0);
  const story = [
    { title: 'A message arrives', detail: 'A text claims the recipient account is locked and creates pressure to act immediately.' },
    { title: 'A link is inspected', detail: 'The address uses account-support language on a domain that does not match an official service.' },
    { title: 'A warning is shown', detail: 'PhishGuard highlights the signals and recommends not opening the link or sharing credentials.' },
  ];
  const signals = [
    { title: 'Lookalike domain', description: 'Uses account-support language to imitate a trusted service.', strength: 88 },
    { title: 'Credential request', description: 'The message asks for immediate identity verification.', strength: 72 },
    { title: 'Sender mismatch', description: 'The sender is not verified in this sample case.', strength: 56 },
  ];
  const reactions = [
    { label: 'Suspicious', count: 68, percent: 68, className: 'reaction-suspicious' },
    { label: 'Not sure', count: 21, percent: 21, className: 'reaction-unsure' },
    { label: 'Looks safe', count: 11, percent: 11, className: 'reaction-safe' },
  ];
  const experiences = [
    { initials: 'R', role: 'Student · sample response', quote: 'The urgent account warning made me pause. I would check with the bank using its official app.' },
    { initials: 'P', role: 'Parent · sample response', quote: 'The link name looked official at first, but the domain did not seem familiar.' },
    { initials: 'S', role: 'Older adult · sample response', quote: 'I was unsure what to do next. A clear warning helped me avoid tapping the link.' },
  ];

  return <div className="page-content forensics-page">
    <button className="back-link" onClick={onBack}><Icon name="back" size={18} /> Digital forensics</button>
    <p className="eyebrow">CASE SM-0241 / SAMPLE REPORT</p>
    <h2 className="forensics-title">Link investigation.</h2>
    <div className="forensic-alert"><Icon name="alert" /><span><strong>Likely phishing attempt</strong><small>Captured by AI monitoring system · sample</small></span><strong>HIGH RISK</strong></div>

    <section className="forensic-score-card" aria-label="Illustrative risk score">
      <div className="forensic-score-copy"><p className="eyebrow">SAMPLE RISK SCORE</p><strong>86<span>/100</span></strong><small>Elevated risk in this example case</small></div>
      <div className="risk-gauge" role="img" aria-label="Illustrative sample risk score: 86 out of 100">
        <svg viewBox="0 0 120 120" aria-hidden="true"><circle className="gauge-track" cx="60" cy="60" r="48" /><circle className="gauge-value" cx="60" cy="60" r="48" /></svg>
        <span className="risk-gauge-mark" aria-hidden="true">!</span>
      </div>
    </section>
    <p className="chart-caption">Risk data from your PhishGuard account.</p>

    <section className="forensic-story">
      <div className="forensic-section-heading"><div><p className="eyebrow">THE STORY</p><h3>How this warning unfolded</h3></div></div>
      <div className="story-steps" role="tablist" aria-label="Investigation story steps">
        {story.map((item, index) => <button key={item.title} className={`story-step ${storyStep === index ? 'selected' : ''}`} role="tab" aria-selected={storyStep === index} onClick={() => setStoryStep(index)}><span>{index + 1}</span><small>{item.title}</small></button>)}
      </div>
        <div className="story-panel" role="tabpanel" key={storyStep}><span className="story-panel-icon"><Icon name={storyStep === 0 ? 'message' : storyStep === 1 ? 'link' : 'shield'} /></span><div><strong>{story[storyStep].title}</strong><p>{story[storyStep].detail}</p></div></div>
    </section>

    <section className="forensic-chart">
      <div className="forensic-section-heading"><div><p className="eyebrow">SIGNAL BREAKDOWN</p><h3>What stood out</h3></div></div>
      <div className="signal-chart">
        {signals.map((signal, index) => <div className="chart-row" key={signal.title} style={{ '--bar-width': `${signal.strength}%`, '--bar-delay': `${index * 130}ms` }}><div className="chart-row-label"><strong>{signal.title}</strong><span>{signal.strength}</span></div><div className="chart-track"><span /></div><small>{signal.description}</small></div>)}
      </div>
    </section>

    <section className="people-experiences">
      <div className="forensic-section-heading"><div><p className="eyebrow">COMMUNITY PERSPECTIVE</p><h3>How people might react</h3></div></div>
      <p className="chart-caption chart-intro">Community reaction data from your PhishGuard account.</p>
      <div className="reaction-chart" role="img" aria-label="Illustrative sample of 100 reactions: 68 suspicious, 21 unsure, 11 looks safe">
        {reactions.map((reaction) => <div className="reaction-row" key={reaction.label}>
          <div className="reaction-label"><strong>{reaction.label}</strong><span>{reaction.count}%</span></div>
          <div className="reaction-track"><span className={reaction.className} style={{ '--reaction-width': `${reaction.percent}%` }} /></div>
        </div>)}
      </div>
      <p className="reaction-total">Example dataset: 100 fictional responses · not verified community data</p>
      <div className="experience-list">
        {experiences.map((experience) => <article className="experience-card" key={experience.initials}>
          <span className="experience-avatar">{experience.initials}</span>
          <div><strong>{experience.role}</strong><p>“{experience.quote}”</p></div>
        </article>)}
      </div>
    </section>

    <div className="content-section"><h3>Domain intelligence</h3><DetailField label="DOMAIN" value={activitySample.domain} /><DetailField label="REGISTRAR" value={<>{activitySample.registrar} <em>· sample</em></>} /><DetailField label="REGISTERED" value={<>{activitySample.registered} <em>· sample</em></>} /><DetailField label="SIGNAL" value={activitySample.signal} /></div>
    <div className="content-section"><h3>Detection signals</h3>{signals.map((signal, index) => <div className="forensic-signal" key={signal.title}><span>0{index + 1}</span><div><strong>{signal.title}</strong><small>{signal.description}</small></div></div>)}</div>
      <div className="community-card"><div><strong>{upvoted ? '1,285' : '1,284'} scam votes</strong><small>Community reports from your PhishGuard account</small></div><button disabled={upvoted} onClick={() => setUpvoted(true)}>{upvoted ? 'Voted' : '♧  Upvote'}</button></div>
    <p className="sample-note">Data from your PhishGuard account.</p>
    <button className="outline-button" onClick={onBack}>Back to activity <Icon name="back" size={18} /></button>
  </div>;
}
