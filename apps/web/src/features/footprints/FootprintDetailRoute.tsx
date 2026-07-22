import { IconButton } from "@bliver/ui";
import type { FootprintMediaPreview } from "@bliver/contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  CalendarDays,
  Crosshair,
  Globe2,
  Image as ImageIcon,
  ImageOff,
  LockKeyhole,
  MapPin,
  UsersRound,
  X,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router-dom";

import { ConversationSection } from "../activity/ConversationSection.js";
import { MomentFrame } from "../../components/moment/MomentFrame.js";
import { FootprintMoodMark } from "../../components/moment/FootprintMoodMark.js";
import { savePendingActionRecord } from "../../platform/pending-action.js";
import { runSpatialTransition } from "../../platform/motion/spatial-navigation.js";
import {
  gsap,
  motionTokens,
  useGSAP,
  withMotionPreferences,
} from "../../platform/motion/gsap.js";
import { useFootprintQuery } from "./api.js";
import {
  footprintDefault,
  type FootprintTranslationKey,
} from "./translations.js";
import "./footprints.css";

interface FootprintDetailProps {
  readonly footprint: {
    readonly id: string;
    readonly message: string;
    readonly visibility: "public" | "friends" | "private";
    readonly locationPrecision: "precise" | "approximate";
    readonly author?: { readonly name: string };
    readonly displayPoint?: { readonly lat: number; readonly lng: number };
    readonly primaryMedia?: FootprintMediaPreview;
    readonly mood?: string | null;
    readonly publishedAt?: string;
  };
  readonly onClose?: () => void;
  readonly loadFromApi?: boolean;
}

type FootprintCopy = (
  key: FootprintTranslationKey,
  values?: Record<string, string | number>,
) => string;

function dateParts(
  value: string | undefined,
  locale: string,
): {
  readonly day: string;
  readonly month: string;
  readonly full?: string;
} {
  if (!value) return { day: "--", month: "" };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { day: "--", month: "" };
  const dayFormatter = new Intl.DateTimeFormat(locale, { day: "2-digit" });
  return {
    // Some locales append a day classifier (for example, "19日"). The
    // oversized folio needs the numeric part only; keep the classifier out
    // of the visual date block while preserving the localized month below.
    day: dayFormatter.formatToParts(date).find((part) => part.type === "day")?.value
      ?? dayFormatter.format(date),
    month: date.toLocaleDateString(locale, { month: "short" }),
    full: date.toLocaleString(locale, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }),
  };
}

export function FootprintDetailRoute(props: FootprintDetailProps) {
  const client = useMemo(() => new QueryClient(), []);
  return (
    <QueryClientProvider client={client}>
      <FootprintDetailBody {...props} />
    </QueryClientProvider>
  );
}

function FootprintDetailBody({
  footprint,
  onClose,
  loadFromApi = false,
}: FootprintDetailProps) {
  const { i18n, t } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const copy: FootprintCopy = (key, values = {}) =>
    String(
      t(`footprints.${key}`, {
        defaultValue: footprintDefault(key, values),
        ...values,
      }),
    );
  const remote = useFootprintQuery(footprint.id, loadFromApi);
  const location = useLocation();
  const [mediaState, setMediaState] = useState<{ readonly url: string; readonly state: "loading" | "loaded" | "error" } | null>(null);
  const displayed = remote.data ?? footprint;
  const authorName = displayed.author?.name;
  const initial = authorName?.trim().slice(0, 1).toLocaleUpperCase() ?? "?";
  const date = dateParts(displayed.publishedAt, locale);
  const visibilityLabel =
    displayed.visibility === "public"
      ? copy("public")
      : displayed.visibility === "friends"
        ? copy("friendsOnly")
        : copy("onlyYou");
  const precisionLabel =
    displayed.locationPrecision === "precise"
      ? copy("preciseLocation")
      : copy("approximateLocation");
  const VisibilityIcon =
    displayed.visibility === "public"
      ? Globe2
      : displayed.visibility === "friends"
        ? UsersRound
        : LockKeyhole;
  const primaryMedia = displayed.primaryMedia;
  const mapHref = displayed.displayPoint
    ? `/map?lat=${displayed.displayPoint.lat}&lng=${displayed.displayPoint.lng}&footprint=${displayed.id}&sheet=preview`
    : null;
  const mediaAuthor = authorName ?? copy("footprint");
  const mediaFailed = Boolean(primaryMedia && mediaState?.url === primaryMedia.url && mediaState.state === "error");
  const mediaReady = Boolean(primaryMedia && mediaState?.url === primaryMedia.url && mediaState.state === "loaded");
  const isSpatialStage = mediaFailed || !primaryMedia;
  const detailRef = useRef<HTMLElement>(null);
  const closingRef = useRef(false);
  const closeDetail = (): void => {
    if (!onClose || closingRef.current) return;
    closingRef.current = true;
    const source = detailRef.current?.querySelector<HTMLElement>(".footprint-detail__media-stage") ?? null;
    runSpatialTransition({
      kind: "to-map",
      navigate: onClose,
      source,
    });
  };
  const onAuthRequired = (action: Record<string, string>): void => {
    savePendingActionRecord(action, `${location.pathname}${location.search}`);
  };

  useGSAP(() => {
    const root = detailRef.current;
    if (!root) return;
    const lens = root.querySelector<HTMLElement>(".footprint-detail__lens");
    const frame = root.querySelector<HTMLElement>(".footprint-detail__media-frame");
    const topbar = root.querySelector<HTMLElement>(".footprint-detail__topbar");
    const caption = root.querySelector<HTMLElement>(".footprint-detail__media-caption");
    const overlay = root.querySelector<HTMLElement>(".footprint-detail__story-overlay");
    const content = root.querySelector<HTMLElement>(".footprint-detail__content");
    if (!lens || !frame || !topbar || !caption || !overlay || !content) return;

    return withMotionPreferences(root, ({ reducedMotion }) => {
      const contentItems = root.querySelectorAll<HTMLElement>(
        ".footprint-detail__story-overlay .footprint-detail__identity, .footprint-detail__story-overlay .footprint-detail__story, .footprint-detail__cache, .footprint-detail__facts, .footprint-detail .conversation",
      );
      if (reducedMotion) {
        gsap.set([lens, frame, topbar, caption, contentItems], {
          clearProps: "transform,opacity,visibility,clipPath,willChange",
        });
        return;
      }

      const timeline = gsap.timeline({ defaults: { overwrite: "auto" } });
      timeline
        .fromTo(lens, {
          y: 18,
          clipPath: "inset(0 0 8% 0)",
        }, {
          y: 0,
          clipPath: "inset(0 0 0% 0)",
          duration: motionTokens.duration.contentRoute,
          ease: motionTokens.ease.route,
          clearProps: "transform,clipPath,willChange",
        })
        .fromTo(frame, { scale: 1.035 }, {
          scale: 1,
          duration: motionTokens.duration.sharedElement,
          ease: motionTokens.ease.shared,
          clearProps: "transform,willChange",
        }, 0)
        .fromTo([topbar, caption], { y: -8 }, {
          y: 0,
          duration: motionTokens.duration.state,
          ease: motionTokens.ease.quiet,
          stagger: 0.04,
          clearProps: "transform,willChange",
        }, 0.08)
        .fromTo(contentItems, { y: 14 }, {
          y: 0,
          duration: motionTokens.duration.state,
          ease: motionTokens.ease.quiet,
          stagger: 0.045,
          clearProps: "transform,willChange",
        }, 0.12);
      return () => timeline.kill();
    });
  }, { dependencies: [displayed.id], scope: detailRef, revertOnUpdate: true });

  return (
    <section ref={detailRef} className="footprint-detail">
      <article className="footprint-detail__lens">
        <header className="footprint-detail__topbar">
          {remote.isLoading ? (
            <span role="status">{copy("syncing")}</span>
          ) : null}
          {onClose ? (
            <IconButton
              className="footprint-detail__close"
              label={copy("close")}
              onClick={closeDetail}
            >
              <X aria-hidden="true" />
            </IconButton>
          ) : null}
        </header>

        <div className={`footprint-detail__layout${primaryMedia ? " footprint-detail__layout--media" : ""}`}>
          <figure
            className={`footprint-detail__media-stage${mediaReady ? " is-loaded" : ""}${mediaFailed ? " is-fallback" : ""}${primaryMedia ? " has-media" : " is-spatial"}`}
            data-frame-mode={isSpatialStage ? "spatial" : "media"}
          >
            <div className="footprint-detail__media-frame" aria-busy={Boolean(primaryMedia && !mediaReady && !mediaFailed)}>
              <MomentFrame
                authorName={mediaAuthor}
                displayPoint={displayed.displayPoint}
                fetchPriority="high"
                loading="eager"
                loadingLabel={copy("photoLoading")}
                locale={locale}
                media={primaryMedia}
                mediaAlt={copy("photoAlt", { author: mediaAuthor })}
                mood={displayed.mood}
                mediaUnavailableLabel={copy("photoUnavailable")}
                mediaUnavailableTitle={copy("photoUnavailableTitle")}
                onMediaStateChange={(state) => {
                  if (primaryMedia && (state === "error" || state === "loaded" || state === "loading")) {
                    setMediaState({ url: primaryMedia.url, state });
                  }
                }}
                precisionLabel={precisionLabel}
                publishedAt={displayed.publishedAt}
                retryMediaLabel={copy("retryPhoto")}
                showCoordinates={false}
                showRetryOnError
                showTelemetry={false}
                spatialLabel={copy("spatialFallback")}
                variant="detail"
                visibilityLabel={visibilityLabel}
              />
              {!primaryMedia ? (
                <div className="footprint-detail__scene-hud">
                  <span className="footprint-detail__scene-state" role="status">
                    <ImageOff aria-hidden="true" />
                    <span>{copy("noPhoto")}</span>
                  </span>
                </div>
              ) : null}
            </div>
            <div
              className="footprint-detail__story-overlay"
              data-story-layout={isSpatialStage ? "spatial" : "media"}
            >
              <header className="footprint-detail__identity">
                <span aria-hidden="true">{initial}</span>
                <div>
                  <strong>{authorName ?? copy("footprint")}</strong>
                  {date.full && displayed.publishedAt ? (
                    <time dateTime={displayed.publishedAt}>{date.full}</time>
                  ) : (
                    <small>{copy("savedMoment")}</small>
                  )}
                </div>
                <FootprintMoodMark className="footprint-detail__mood" mood={displayed.mood} />
              </header>
              <div className="footprint-detail__story">
                <h1>{copy("footprint")}</h1>
                <p>{displayed.message}</p>
              </div>
            </div>
            <figcaption className="footprint-detail__media-caption">
              <span className="footprint-detail__media-date">
                <CalendarDays aria-hidden="true" />
                <span>
                  <strong className="footprint-detail__day">{date.day}</strong>
                  <small>{date.month || copy("savedMoment")}</small>
                </span>
              </span>
              <span className="footprint-detail__media-meta">
                <span>
                  {isSpatialStage ? <MapPin aria-hidden="true" /> : <ImageIcon aria-hidden="true" />}
                  {isSpatialStage ? copy("spatialFallback") : copy("photoBy", { author: mediaAuthor })}
                </span>
                <small>
                  {displayed.displayPoint
                    ? `${displayed.displayPoint.lat.toFixed(5)} / ${displayed.displayPoint.lng.toFixed(5)}`
                    : copy("locationProtected")}
                </small>
              </span>
            </figcaption>
          </figure>

          <div className="footprint-detail__content">
            {remote.isError ? (
              <p className="footprint-detail__cache" role="status">
                {copy("showingCached")}
              </p>
            ) : null}

            <ul
              className="footprint-detail__facts"
              aria-label={copy("details")}
            >
              <li>
                <VisibilityIcon aria-hidden="true" />
                <span>{visibilityLabel}</span>
              </li>
              <li>
                <Crosshair aria-hidden="true" />
                <span>{precisionLabel}</span>
              </li>
              {displayed.displayPoint ? (
                <li>
                  <Link className="footprint-detail__map-link" to={mapHref ?? "/map"}>
                    <MapPin aria-hidden="true" />
                    <span>
                      {displayed.displayPoint.lat.toFixed(3)},{" "}
                      {displayed.displayPoint.lng.toFixed(3)}
                    </span>
                  </Link>
                </li>
              ) : null}
            </ul>

          </div>
          <div className="footprint-detail__discussion">
            <ConversationSection
              footprintId={footprint.id}
              onAuthRequired={onAuthRequired}
            />
          </div>
        </div>
      </article>
    </section>
  );
}
