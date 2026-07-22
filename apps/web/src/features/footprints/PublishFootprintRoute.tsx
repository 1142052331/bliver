import type { PublishFootprintRequest } from "@bliver/contracts";
import { Button } from "@bliver/ui";
import {
  ArrowRight,
  Check,
  CircleAlert,
  Compass,
  Crosshair,
  FileImage,
  Globe2,
  ImagePlus,
  LockKeyhole,
  MapPin,
  Navigation,
  RotateCcw,
  Send,
  UsersRound,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { MomentFrame } from "../../components/moment/MomentFrame.js";
import { FootprintMoodMark } from "../../components/moment/FootprintMoodMark.js";
import {
  resolveFootprintMood,
  type FootprintMoodKey,
} from "../../platform/footprint-mood.js";
import {
  clearFootprintDraft,
  loadFootprintDraft,
  saveFootprintDraft,
} from "../../platform/drafts.js";
import {
  gsap,
  prefersReducedMotion,
  useGSAP,
} from "../../platform/motion/gsap.js";
import {
  footprintDefault,
  type FootprintTranslationKey,
} from "./translations.js";
import { MoodExposureSelector } from "./MoodExposureSelector.js";
import "./publish-footprint.css";

type PublishInput = Omit<PublishFootprintRequest, "mediaAssetIds"> & {
  readonly mediaAssetIds?: readonly string[];
};

export interface PublishFootprintRouteProps {
  readonly initialPoint?: { readonly lat: number; readonly lng: number };
  readonly mapHref?: string;
  readonly signUpload: (file: File) => Promise<unknown>;
  readonly publish: (input: PublishInput) => Promise<void>;
}

type FootprintCopy = (
  key: FootprintTranslationKey,
  values?: Record<string, string | number>,
) => string;

function useFootprintCopy(): {
  readonly copy: FootprintCopy;
  readonly closeLabel: string;
  readonly locale: string;
} {
  const { i18n, t } = useTranslation();
  return {
    closeLabel: String(t("common.close")),
    locale: i18n.resolvedLanguage ?? i18n.language,
    copy: (key, values = {}) =>
      String(
        t(`footprints.${key}`, {
          defaultValue: footprintDefault(key, values),
          ...values,
        }),
      ),
  };
}

function visibilityCopy(
  value: "public" | "friends" | "private",
  copy: FootprintCopy,
): string {
  if (value === "friends") return copy("friendsVisibility");
  if (value === "private") return copy("privateVisibility");
  return copy("publicVisibility");
}

function precisionCopy(
  value: "precise" | "approximate",
  copy: FootprintCopy,
): string {
  return value === "precise"
    ? copy("preciseSharing")
    : copy("approximateSharing");
}

function readableSize(
  bytes: number,
  copy: FootprintCopy,
  locale: string,
): string {
  const format = (size: number): string =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(size);
  if (bytes < 1024) return copy("fileBytes", { size: format(bytes) });
  if (bytes < 1024 * 1024) {
    return copy("fileKilobytes", { size: format(bytes / 1024) });
  }
  return copy("fileMegabytes", { size: format(bytes / 1024 / 1024) });
}

export function PublishFootprintRoute({
  initialPoint,
  mapHref = "/map",
  signUpload,
  publish,
}: PublishFootprintRouteProps) {
  const { closeLabel, copy, locale } = useFootprintCopy();
  const recovered = useMemo(() => loadFootprintDraft(), []);
  const [message, setMessage] = useState(recovered?.message ?? "");
  const [mood, setMood] = useState<FootprintMoodKey | undefined>(recovered?.mood);
  const [visibility, setVisibility] = useState<
    "public" | "friends" | "private"
  >(recovered?.visibility ?? "public");
  const [locationPrecision, setLocationPrecision] = useState<
    "precise" | "approximate"
  >(recovered?.locationPrecision ?? "approximate");
  const [file, setFile] = useState<File>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [published, setPublished] = useState(false);
  const [draftRecovered, setDraftRecovered] = useState(Boolean(recovered));
  const [failedPhotoPreviewUrl, setFailedPhotoPreviewUrl] = useState<
    string | null
  >(null);
  const studioRef = useRef<HTMLDivElement>(null);
  const successTitleRef = useRef<HTMLHeadingElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const submittingRef = useRef(false);

  const photoUrl = useMemo(() => {
    if (
      !file ||
      typeof URL === "undefined" ||
      typeof URL.createObjectURL !== "function"
    ) {
      return undefined;
    }
    return URL.createObjectURL(file);
  }, [file]);
  const photoPreviewFailed = Boolean(
    photoUrl && failedPhotoPreviewUrl === photoUrl,
  );
  const previewMedia = photoUrl && !photoPreviewFailed
    ? { url: photoUrl, width: 16, height: 10 }
    : undefined;
  const publishedMoodTone = resolveFootprintMood(mood);
  const publishedMoodStyle = publishedMoodTone
    ? {
        "--publish-mood-accent": publishedMoodTone.accent,
        "--publish-mood-surface": publishedMoodTone.surface,
        "--publish-mood-ink": publishedMoodTone.ink,
      } as CSSProperties
    : undefined;

  useEffect(() => {
    if (published) return;
    if (message || mood || draftRecovered) {
      saveFootprintDraft({
        message,
        ...(mood ? { mood } : {}),
        visibility,
        locationPrecision,
      });
      return;
    }
    clearFootprintDraft();
  }, [draftRecovered, locationPrecision, message, mood, published, visibility]);

  useEffect(() => {
    return () => {
      if (photoUrl) URL.revokeObjectURL(photoUrl);
    };
  }, [photoUrl]);

  useEffect(() => {
    if (!published) return;

    const scrollingElement = document.scrollingElement;
    if (scrollingElement && "scrollTo" in scrollingElement) {
      scrollingElement.scrollTo({ top: 0, left: 0, behavior: "auto" });
    } else if (typeof window.scrollTo === "function") {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    }
    successTitleRef.current?.focus({ preventScroll: true });
  }, [published]);

  useGSAP(
    () => {
      const composer = studioRef.current;
      if (!composer || prefersReducedMotion()) return;

      const entrance = gsap.fromTo(
        composer,
        { autoAlpha: 0.86, y: 28, scale: 0.985 },
        {
          autoAlpha: 1,
          y: 0,
          scale: 1,
          duration: 0.42,
          ease: "power4.out",
          clearProps: "opacity,visibility,transform",
        },
      );
      return () => entrance.kill();
    },
    { scope: studioRef },
  );

  useGSAP(
    () => {
      const studio = studioRef.current;
      if (!studio || prefersReducedMotion()) return;

      const mediaPreview = studio.querySelector<HTMLElement>(
        "[data-publish-media-preview]",
      );
      if (!published && mediaPreview) {
        const caption = studio.querySelector<HTMLElement>(
          ".publish-media__caption",
        );
        const mediaTween = gsap.fromTo(
          mediaPreview,
          { clipPath: "inset(7% 7% round 18px)", scale: 1.025 },
          {
            clipPath: "inset(0% 0% round 0px)",
            scale: 1,
            duration: 0.42,
            ease: "power4.out",
            overwrite: "auto",
            clearProps: "clipPath,transform",
          },
        );
        const captionTween = caption
          ? gsap.fromTo(
              caption,
              { autoAlpha: 0.72, y: 8 },
              {
                autoAlpha: 1,
                y: 0,
                duration: 0.28,
                ease: "power3.out",
                overwrite: "auto",
                clearProps: "opacity,visibility,transform",
              },
            )
          : undefined;
        return () => {
          mediaTween.kill();
          captionTween?.kill();
        };
      }

      const result = studio.querySelector<HTMLElement>(".publish-result");
      if (!published || !result) return;

      const visual = result.querySelector<HTMLElement>(
        ".publish-result__visual",
      );
      const mark = result.querySelector<HTMLElement>(".publish-result__mark");
      const content = Array.from(
        result.querySelectorAll<HTMLElement>(
          ".publish-result__copy > *, .publish-result__moment, .publish-result__summary, .publish-result__actions",
        ),
      );
      if (!visual || !mark) return;

      const timeline = gsap.timeline({
        defaults: { ease: "power4.out", overwrite: "auto" },
      });
      timeline
        .fromTo(
          visual,
          { clipPath: "inset(12% 10% round 24px)", scale: 0.985 },
          {
            clipPath: "inset(0% 0% round 0px)",
            scale: 1,
            duration: 0.76,
          },
          0,
        )
        .fromTo(
          mark,
          { autoAlpha: 0, y: 18, scale: 0.86 },
          { autoAlpha: 1, y: 0, scale: 1, duration: 0.48 },
          0.18,
        )
        .fromTo(
          content,
          { autoAlpha: 0.72, y: 14 },
          { autoAlpha: 1, y: 0, duration: 0.42, stagger: 0.045 },
          0.3,
        );
      return () => timeline.kill();
    },
    {
      dependencies: [photoPreviewFailed, photoUrl, published],
      revertOnUpdate: true,
      scope: studioRef,
    },
  );

  const submit = async (): Promise<void> => {
    if (submittingRef.current) return;

    setError(undefined);
    if (!message.trim()) {
      setError(copy("messageRequired"));
      return;
    }
    if (!initialPoint) {
      setError(copy("locationRequiredError"));
      return;
    }

    submittingRef.current = true;
    setBusy(true);
    try {
      let mediaAssetIds: string[] = [];
      if (file) {
        const signed = await signUpload(file);
        const assetId =
          typeof signed === "object" &&
          signed !== null &&
          "assetId" in signed &&
          typeof signed.assetId === "string"
            ? signed.assetId
            : undefined;
        if (assetId) mediaAssetIds = [assetId];
      }
      await publish({
        message: message.trim(),
        ...(mood ? { mood } : {}),
        privatePoint: initialPoint,
        visibility,
        locationPrecision,
        mediaAssetIds,
      });
      clearFootprintDraft();
      setDraftRecovered(false);
      setPublished(true);
    } catch {
      setError(file ? copy("uploadFailed") : copy("publishFailed"));
    } finally {
      submittingRef.current = false;
      setBusy(false);
    }
  };

  const removePhoto = (): void => {
    setFile(undefined);
    setFailedPhotoPreviewUrl(null);
    if (photoInputRef.current) photoInputRef.current.value = "";
  };

  const composeAnother = (): void => {
    clearFootprintDraft();
    setDraftRecovered(false);
    setError(undefined);
    setMood(undefined);
    removePhoto();
    setMessage("");
    setPublished(false);
  };

  const VisibilityIcon =
    visibility === "public"
      ? Globe2
      : visibility === "friends"
        ? UsersRound
        : LockKeyhole;
  const PrecisionIcon =
    locationPrecision === "precise" ? Crosshair : Navigation;
  const visibilityLabel =
    visibility === "public"
      ? copy("everyone")
      : visibility === "friends"
        ? copy("friends")
        : copy("onlyMe");
  const precisionLabel =
    locationPrecision === "precise" ? copy("precise") : copy("approximate");
  const publishedMapHref = initialPoint
    ? `/map?lat=${encodeURIComponent(String(initialPoint.lat))}&lng=${encodeURIComponent(String(initialPoint.lng))}`
    : "/map";

  return (
    <section className="publish-route publish-workbench">
      <div
        ref={studioRef}
        className={`publish-composer${busy ? " is-publishing" : ""}${published ? " is-published" : ""}`}
        aria-busy={busy}
        aria-label={copy("publishTitle")}
        role="region"
      >
        {published ? (
          <div className="publish-result">
            <div
              className={`publish-result__visual${previewMedia ? " has-media" : " is-text-only"}`}
            >
              {previewMedia ? (
                <MomentFrame
                  authorName={copy("footprint")}
                  displayPoint={initialPoint}
                  loading="eager"
                  locale={locale}
                  media={previewMedia}
                  mediaAlt={copy("selectedPhotoPreview")}
                  mood={mood}
                  precisionLabel={precisionCopy(locationPrecision, copy)}
                  showCoordinates={false}
                  showTelemetry={false}
                  spatialLabel={copy("spatialPreview")}
                  variant="stage"
                  visibilityLabel={visibilityCopy(visibility, copy)}
                />
              ) : (
                <div
                  className="publish-result__text-poster"
                  data-footprint-mood={publishedMoodTone?.key}
                  style={publishedMoodStyle}
                >
                  <FootprintMoodMark mood={mood} />
                  <span>{copy("savedMoment")}</span>
                  <blockquote>{message.trim()}</blockquote>
                </div>
              )}
              <span className="publish-result__mark" aria-hidden="true">
                <Check />
              </span>
              <span className="publish-result__place">
                <MapPin aria-hidden="true" />
                {copy("pointSelected")}
              </span>
            </div>

            <div
              className="publish-result__copy"
              role="status"
              aria-live="polite"
            >
              <p>{copy("publishedLabel")}</p>
              <h1 ref={successTitleRef} tabIndex={-1}>
                {copy("publishSuccessTitle")}
              </h1>
              <p>{copy("publishSuccessSubtitle")}</p>
            </div>

            {previewMedia ? (
              <blockquote className="publish-result__moment">
                {message.trim()}
              </blockquote>
            ) : null}

            <dl className="publish-result__summary">
              <div>
                <dt>{copy("publishedAudience")}</dt>
                <dd>{visibilityCopy(visibility, copy)}</dd>
              </div>
              <div>
                <dt>{copy("publishedPrecision")}</dt>
                <dd>{precisionCopy(locationPrecision, copy)}</dd>
              </div>
            </dl>

            <div className="publish-result__actions">
              <Link
                className="publish-result__action publish-result__action--primary"
                to={publishedMapHref}
              >
                <MapPin aria-hidden="true" />
                <span>{copy("viewOnMap")}</span>
                <ArrowRight aria-hidden="true" />
              </Link>
              <Link className="publish-result__action" to="/activity">
                <Compass aria-hidden="true" />
                <span>{copy("viewActivity")}</span>
              </Link>
              <button
                className="publish-result__action publish-result__action--publish"
                type="button"
                onClick={composeAnother}
              >
                <RotateCcw aria-hidden="true" />
                <span>{copy("publishAgain")}</span>
              </button>
            </div>
          </div>
        ) : (
          <form
            className={`publish-compose-form${message.trim() && initialPoint ? " is-ready" : ""}`}
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <header className="publish-compose-form__header">
              <div>
                <h1>{copy("publishTitle")}</h1>
                <p>{copy("publishSubtitle")}</p>
              </div>
              <div className="publish-compose-form__header-actions">
                {draftRecovered ? (
                  <span>
                    <Check aria-hidden="true" />
                    {copy("draftRecovered")}
                  </span>
                ) : null}
                <Link
                  className="publish-compose-form__close"
                  to={mapHref}
                  aria-label={closeLabel}
                  title={closeLabel}
                >
                  <X aria-hidden="true" />
                </Link>
              </div>
            </header>

            <section
              className={`publish-place${initialPoint ? " has-location" : ""}`}
              aria-label={copy("selectedLocation")}
            >
              <span className="publish-place__pin" aria-hidden="true">
                <MapPin />
              </span>
              <div className="publish-location__readout">
                <span>
                  {initialPoint
                    ? copy("pointSelected")
                    : copy("locationRequired")}
                </span>
                {initialPoint ? (
                  <strong>
                    {initialPoint.lat.toFixed(5)} / {initialPoint.lng.toFixed(5)}
                  </strong>
                ) : (
                  <strong>{copy("noMapPoint")}</strong>
                )}
              </div>
              <Link className="publish-place__map-link" to={mapHref}>
                <span>
                  {initialPoint ? copy("changeOnMap") : copy("chooseOnMap")}
                </span>
                <ArrowRight aria-hidden="true" />
              </Link>
            </section>

            <label className="publish-story" htmlFor="message">
              <span>
                <strong>{copy("message")}</strong>
                <small>{copy("characterCount", { count: message.length })}</small>
              </span>
              <textarea
                id="message"
                aria-label={copy("message")}
                aria-describedby={error ? "publish-error" : undefined}
                aria-invalid={Boolean(error && !message.trim())}
                value={message}
                disabled={busy}
                onChange={(event) => {
                  const nextMessage = event.target.value;
                  setMessage(nextMessage);
                  if (draftRecovered) setDraftRecovered(false);
                  if (!nextMessage) clearFootprintDraft();
                  if (error) setError(undefined);
                }}
                rows={4}
                maxLength={2000}
                placeholder={copy("messagePlaceholder")}
              />
            </label>

            <MoodExposureSelector
              copy={copy}
              disabled={busy}
              hasMedia={Boolean(file)}
              value={mood}
              onChange={(nextMood) => {
                setMood(nextMood);
                if (draftRecovered) setDraftRecovered(false);
              }}
            />

            <input
              ref={photoInputRef}
              className="publish-media__input"
              id="photo"
              aria-label={copy("photoOptional")}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              disabled={busy}
              onChange={(event) => {
                setFailedPhotoPreviewUrl(null);
                setFile(event.target.files?.[0]);
              }}
            />

            <section className={`publish-media${file ? " has-file" : ""}`}>
              <div
                className="publish-media__stage"
                {...(previewMedia
                  ? { "data-publish-media-preview": "true" }
                  : {})}
              >
                {previewMedia ? (
                  <MomentFrame
                    authorName={copy("footprint")}
                    displayPoint={initialPoint}
                    loading="eager"
                    locale={locale}
                    media={previewMedia}
                    mediaAlt={copy("selectedPhotoPreview")}
                    onMediaStateChange={(state) => {
                      if (state === "error" && photoUrl) {
                        setFailedPhotoPreviewUrl(photoUrl);
                      }
                    }}
                    precisionLabel={precisionCopy(locationPrecision, copy)}
                    showCoordinates={false}
                    showTelemetry={false}
                    spatialLabel={copy("spatialPreview")}
                    variant="stage"
                    visibilityLabel={visibilityCopy(visibility, copy)}
                  />
                ) : file ? (
                  <div className="publish-media__unavailable" role="status">
                    <FileImage aria-hidden="true" />
                    <span>
                      <strong>{file.name}</strong>
                      <small>{copy("photoPreviewUnavailable")}</small>
                    </span>
                  </div>
                ) : (
                  <label className="publish-media__empty" htmlFor="photo">
                    <ImagePlus aria-hidden="true" />
                    <span>
                      <strong>{copy("photoOptional")}</strong>
                      <small>{copy("photoFormats")}</small>
                    </span>
                    <span>{copy("chooseFile")}</span>
                  </label>
                )}
              </div>

              {file ? (
                <div className="publish-media__caption">
                  <span>
                    <FileImage aria-hidden="true" />
                    <span>
                      <strong>{file.name}</strong>
                      <small>
                        {photoPreviewFailed
                          ? copy("photoPreviewUnavailable")
                          : readableSize(file.size, copy, locale)}
                      </small>
                    </span>
                  </span>
                  <span className="publish-media__actions">
                    <label htmlFor="photo">{copy("replacePhoto")}</label>
                    <button type="button" onClick={removePhoto} disabled={busy}>
                      {copy("removePhoto")}
                    </button>
                  </span>
                </div>
              ) : null}

            </section>

            <div className="publish-options">
              <label className="publish-option" htmlFor="visibility">
                <VisibilityIcon aria-hidden="true" />
                <span>
                  <strong>{copy("whoCanSee")}</strong>
                  <small>{visibilityCopy(visibility, copy)}</small>
                </span>
                <select
                  id="visibility"
                  aria-label={copy("whoCanSee")}
                  value={visibility}
                  disabled={busy}
                  onChange={(event) =>
                    setVisibility(event.target.value as typeof visibility)
                  }
                >
                  <option value="public">{copy("everyone")}</option>
                  <option value="friends">{copy("friends")}</option>
                  <option value="private">{copy("onlyMe")}</option>
                </select>
              </label>

              <label className="publish-option" htmlFor="precision">
                <PrecisionIcon aria-hidden="true" />
                <span>
                  <strong>{copy("locationPrecision")}</strong>
                  <small>{precisionCopy(locationPrecision, copy)}</small>
                </span>
                <select
                  id="precision"
                  aria-label={copy("locationPrecision")}
                  value={locationPrecision}
                  disabled={busy}
                  onChange={(event) =>
                    setLocationPrecision(
                      event.target.value as typeof locationPrecision,
                    )
                  }
                >
                  <option value="approximate">{copy("approximate")}</option>
                  <option value="precise">{copy("precise")}</option>
                </select>
              </label>
            </div>

            {error ? (
              <p
                id="publish-error"
                className="publish-compose-form__error"
                role="alert"
              >
                <CircleAlert aria-hidden="true" />
                <span>{error}</span>
              </p>
            ) : null}

            <footer className="publish-compose-form__footer">
              <p>
                <VisibilityIcon aria-hidden="true" />
                <span>
                  <strong>{visibilityLabel}</strong>
                  <small>{precisionLabel}</small>
                </span>
              </p>
              <Button
                type="submit"
                variant="publish"
                disabled={busy}
                loading={busy}
              >
                <Send aria-hidden="true" />
                <span>{busy ? copy("publishing") : copy("publishAction")}</span>
              </Button>
            </footer>
          </form>
        )}
      </div>
    </section>
  );
}
