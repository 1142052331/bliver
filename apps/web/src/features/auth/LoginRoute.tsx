import { useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Button, Surface } from '@bliver/ui';
import type { LoginRequest } from '@bliver/contracts';
import {
  CircleAlert,
  Eye,
  EyeOff,
  ArrowRight,
  ArrowUpRight,
  ShieldCheck,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { authApi } from './api.js';
import { consumePendingAction } from '../../platform/pending-action.js';
import { loginReturnDestination } from '../../platform/deep-link.js';
import { authTranslations } from './translations.js';
import {
  gsap,
  motionTokens,
  useGSAP,
  withMotionPreferences,
} from '../../platform/motion/gsap.js';
import './auth.css';

type AuthTranslationKey = keyof typeof authTranslations.en.auth;

export function LoginRoute() {
  const routeRef = useRef<HTMLElement>(null);
  const usernameRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const copy = (key: AuthTranslationKey): string =>
    t(`auth.${key}`, { defaultValue: authTranslations.en.auth[key] });
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [openingLogin, setOpeningLogin] = useState(false);
  const sessionExpired = location.pathname === '/session-expired';
  const interruptedDestination =
    typeof location.state?.from === 'string' ? location.state.from : '/map';
  const loginHref = `/login?returnTo=${encodeURIComponent(interruptedDestination)}`;
  const focusAfterReveal = location.state?.revealLogin === true;

  useGSAP(() => {
    const root = routeRef.current;
    if (!root) return;

    return withMotionPreferences(root, ({ compact, reducedMotion }) => {
      const visual = root.querySelector<HTMLElement>('[data-auth-visual]');
      const memoryMedia = root.querySelector<HTMLElement>('[data-auth-memory-media]');
      const panel = root.querySelector<HTMLElement>('[data-auth-panel]');
      const manifesto = root.querySelector<HTMLElement>('[data-auth-manifesto]');
      const formParts = root.querySelectorAll<HTMLElement>('[data-auth-form-part]');
      if (!visual || !memoryMedia || !panel) return;

      const animated = [visual, memoryMedia, panel, manifesto, ...formParts]
        .filter((item): item is HTMLElement => item !== null);
      if (reducedMotion) {
        gsap.set(animated, {
          clearProps: 'transform,opacity,visibility,clipPath,willChange',
        });
        if (!sessionExpired && focusAfterReveal) {
          requestAnimationFrame(() => usernameRef.current?.focus({ preventScroll: true }));
        }
        return;
      }

      const timeline = gsap.timeline({
        defaults: { ease: motionTokens.ease.route, overwrite: 'auto' },
        onComplete: () => {
          if (!sessionExpired && focusAfterReveal) {
            usernameRef.current?.focus({ preventScroll: true });
          }
        },
      });
      const routeDuration = compact ? motionTokens.duration.authRoute : 0.64;

      timeline
        .addLabel('establish', 0)
        .fromTo(visual, { autoAlpha: 0.92 }, {
          autoAlpha: 1,
          duration: motionTokens.duration.state,
          clearProps: 'opacity,visibility',
        }, 'establish')
        .fromTo(memoryMedia, { scale: 1.065, xPercent: -1.25 }, {
          scale: 1,
          xPercent: 0,
          duration: routeDuration,
          clearProps: 'transform,opacity,visibility',
        }, 'establish')
        .addLabel('panel', compact ? 0.06 : 0.14)
        .fromTo(panel, {
          y: sessionExpired ? 18 : compact ? 52 : 28,
          autoAlpha: 0.92,
        }, {
          y: 0,
          autoAlpha: 1,
          duration: sessionExpired
            ? motionTokens.duration.state
            : motionTokens.duration.contentRoute,
          clearProps: 'transform,opacity,visibility',
        }, 'panel');

      if (manifesto) {
        timeline.fromTo(manifesto, {
          y: 10,
          autoAlpha: 0,
          clipPath: 'inset(0 0 100% 0)',
        }, {
          y: 0,
          autoAlpha: 1,
          clipPath: 'inset(0 0 0% 0)',
          duration: motionTokens.duration.contentRoute,
          clearProps: 'transform,opacity,visibility,clipPath',
        }, 'panel+=0.1');
      }

      if (formParts.length > 0) {
        timeline.fromTo(formParts, { y: 8, autoAlpha: 0.88 }, {
          y: 0,
          autoAlpha: 1,
          duration: motionTokens.duration.state,
          stagger: 0.024,
          clearProps: 'transform,opacity,visibility',
        }, 'panel+=0.08');
      }

      return () => timeline.kill();
    });
  }, {
    dependencies: [focusAfterReveal, sessionExpired],
    revertOnUpdate: true,
    scope: routeRef,
  });

  useGSAP(() => {
    const root = routeRef.current;
    if (!root || !sessionExpired || !openingLogin) return;

    const panel = root.querySelector<HTMLElement>('[data-auth-panel]');
    const memoryMedia = root.querySelector<HTMLElement>('[data-auth-memory-media]');
    if (!panel || !memoryMedia) return;

    return withMotionPreferences(root, ({ reducedMotion }) => {
      const revealLogin = (): void => {
        navigate(loginHref, {
          replace: true,
          state: { from: interruptedDestination, revealLogin: true },
        });
      };

      if (reducedMotion) {
        revealLogin();
        return;
      }

      const timeline = gsap.timeline({
        defaults: {
          ease: motionTokens.ease.quiet,
          overwrite: 'auto',
        },
        onComplete: revealLogin,
      });

      timeline
        .addLabel('release', 0)
        .to(panel, {
          y: 26,
          autoAlpha: 0,
          duration: motionTokens.duration.micro,
        }, 'release')
        .to(memoryMedia, {
          scale: 1.025,
          duration: motionTokens.duration.state,
        }, 'release');

      return () => timeline.kill();
    });
  }, {
    dependencies: [
      interruptedDestination,
      loginHref,
      navigate,
      openingLogin,
      sessionExpired,
    ],
    revertOnUpdate: true,
    scope: routeRef,
  });

  useGSAP(() => {
    const root = routeRef.current;
    if (!root) return;

    return withMotionPreferences(root, ({ reducedMotion }) => {
      const message = root.querySelector<HTMLElement>('.auth-route__message');
      if (!message || !hasError || reducedMotion) return;

      const alert = message.querySelector<HTMLElement>('[role="alert"]');
      if (!alert) return;

      const timeline = gsap.timeline({
        defaults: { ease: motionTokens.ease.standard, overwrite: 'auto' },
      });
      timeline.fromTo(alert, {
        y: -8,
        clipPath: 'inset(0 0 100% 0)',
      }, {
        y: 0,
        clipPath: 'inset(0 0 0 0)',
        duration: motionTokens.duration.state,
        clearProps: 'transform,clipPath',
      });

      return () => timeline.kill();
    });
  }, { dependencies: [hasError], revertOnUpdate: true, scope: routeRef });

  const clearError = (): void => {
    if (hasError) setHasError(false);
  };

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const submittedUsername = String(formData.get('username') ?? username).trim();
    const submittedPassword = String(formData.get('password') ?? password);
    if (!submittedUsername || !submittedPassword || busy) return;

    const input: LoginRequest = {
      username: submittedUsername,
      password: submittedPassword,
      platform: 'web',
    };
    setBusy(true);
    setHasError(false);

    try {
      await authApi.login(input);
      const pending = consumePendingAction();
      const stateFrom =
        typeof location.state?.from === 'string'
          ? location.state.from
          : undefined;
      const destination =
        pending?.returnTo ?? loginReturnDestination(location.search, stateFrom);
      navigate(destination, {
        replace: true,
        ...(pending ? { state: { pendingAction: pending } } : {}),
      });
    } catch {
      setHasError(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      ref={routeRef}
      aria-label={copy(sessionExpired ? 'sessionExpiredTitle' : 'signInTitle')}
      className={`auth-route auth-route--${sessionExpired ? 'expired' : 'login'}`}
      data-auth-state={busy ? 'submitting' : hasError ? 'error' : 'ready'}
      data-auth-mode={sessionExpired ? 'expired' : 'login'}
      data-cinema-scene="auth"
    >
      <div className="auth-route__spatial" aria-hidden="true">
        <div className="auth-route__moment auth-route__moment--media" data-auth-visual>
          <img
            alt=""
            className="auth-route__memory-media"
            data-auth-memory-media
            decoding="sync"
            fetchPriority="high"
            loading="eager"
            src="/images/login-city.webp"
          />
        </div>
      </div>

      {!sessionExpired ? (
        <p className="auth-route__manifesto" data-auth-manifesto aria-hidden="true">
          {copy('spatialTitle')}
        </p>
      ) : null}

      <div className="auth-route__form-column" data-auth-panel>
        <Surface className="auth-route__surface">
          {sessionExpired ? (
            <section className="auth-route__expired-panel">
              <header className="auth-route__expired-header">
                <h1>{copy('sessionExpiredTitle')}</h1>
                <p>{copy('sessionExpiredBody')}</p>
              </header>
              <div className="auth-route__recovery">
                <strong>{copy('sessionRecoveryTitle')}</strong>
                <p>{copy('sessionRecoveryBody')}</p>
              </div>
              <Link
                aria-disabled={openingLogin || undefined}
                className="auth-route__continue"
                state={{ from: interruptedDestination }}
                to={loginHref}
                onClick={(event) => {
                  event.preventDefault();
                  if (!openingLogin) setOpeningLogin(true);
                }}
              >
                <span>{copy('continueSignIn')}</span>
                <ArrowRight aria-hidden="true" />
              </Link>
            </section>
          ) : (
            <>
              <header className="auth-route__header" data-auth-form-part>
                <div className="auth-route__header-copy">
                  <h1>{copy('signInTitle')}</h1>
                  <p>{copy('signInBody')}</p>
                </div>
              </header>

              <form
                className="auth-route__form"
                onSubmit={(event) => void submit(event)}
              >
                <div
                  className="auth-route__message"
                  aria-live="polite"
                  data-auth-form-part
                >
                  {hasError ? (
                    <p id="auth-sign-in-error" role="alert">
                      <CircleAlert aria-hidden="true" />
                      <span>{copy('signInError')}</span>
                    </p>
                  ) : null}
                </div>

                <div className="auth-route__field-stack" data-auth-form-part>
                  <label>
                    <span>{copy('username')}</span>
                    <input
                      aria-describedby={
                        hasError ? 'auth-sign-in-error' : undefined
                      }
                      aria-invalid={hasError}
                      aria-label={copy('username')}
                      autoCapitalize="none"
                      autoComplete="username"
                      disabled={busy}
                      name="username"
                      ref={usernameRef}
                      required
                      spellCheck={false}
                      value={username}
                      onChange={(event) => {
                        setUsername(event.target.value);
                        clearError();
                      }}
                    />
                  </label>

                  <label>
                    <span>{copy('password')}</span>
                    <span className="auth-route__password-field">
                      <input
                        aria-describedby={
                          hasError ? 'auth-sign-in-error' : undefined
                        }
                        aria-invalid={hasError}
                        aria-label={copy('password')}
                        autoComplete="current-password"
                        disabled={busy}
                        name="password"
                        required
                        type={passwordVisible ? 'text' : 'password'}
                        value={password}
                        onChange={(event) => {
                          setPassword(event.target.value);
                          clearError();
                        }}
                      />
                      <button
                        type="button"
                        aria-label={
                          passwordVisible
                            ? copy('concealValue')
                            : copy('revealValue')
                        }
                        aria-pressed={passwordVisible}
                        disabled={busy}
                        title={
                          passwordVisible
                            ? copy('hidePassword')
                            : copy('showPassword')
                        }
                        onClick={() =>
                          setPasswordVisible((visible) => !visible)
                        }
                      >
                        {passwordVisible ? <EyeOff /> : <Eye />}
                      </button>
                    </span>
                  </label>
                </div>

                <div
                  className="auth-route__form-actions"
                  data-auth-form-part
                >
                  <Button
                    className="auth-route__submit"
                    disabled={busy}
                    loading={busy}
                    type="submit"
                  >
                    <span>{copy('signInAction')}</span>
                    <span
                      className="auth-route__submit-direction"
                      aria-hidden="true"
                    >
                      <ArrowRight />
                    </span>
                  </Button>
                  <Link className="auth-route__guest-link" to="/map">
                    <span>{copy('exploreMap')}</span>
                    <ArrowUpRight aria-hidden="true" />
                  </Link>
                </div>
              </form>

              <footer className="auth-route__trust" data-auth-form-part>
                <ShieldCheck aria-hidden="true" />
                <span>{copy('sessionTrust')}</span>
              </footer>
            </>
          )}
        </Surface>
      </div>
    </section>
  );
}
