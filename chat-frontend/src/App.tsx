import { AuthProvider } from './auth/AuthProvider';
import { useAuth } from './auth/context';
import { AuthPage } from './components/AuthPage';
import { BootScreen } from './components/BootScreen';
import { ChatApp } from './components/ChatApp';
import { ProfileSetup } from './components/ProfileSetup';

function AppShell() {
  const { status, user, error, login, signup, logout, updateProfile, retryBootstrap } = useAuth();

  if (status === 'bootstrapping') return <BootScreen />;

  if (status === 'signedOut' || !user) {
    return (
      <AuthPage
        bootstrapError={error}
        onRetryBootstrap={retryBootstrap}
        onLogin={login}
        onSignup={signup}
      />
    );
  }

  if (!user.profileSetup) {
    return <ProfileSetup user={user} onComplete={updateProfile} />;
  }

  return <ChatApp user={user} onLogout={logout} />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}
