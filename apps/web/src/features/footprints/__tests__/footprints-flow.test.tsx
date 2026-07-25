// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BliverI18nProvider } from "../../../i18n/I18nProvider.js";
import { createBliverI18n } from "../../../i18n/i18n.js";
import { FootprintDetailRoute } from "../FootprintDetailRoute.js";
import {
  PublishFootprintRoute,
  type PublishFootprintRouteProps,
} from "../PublishFootprintRoute.js";

function renderRoute(element: React.ReactNode, locale: "en" | "zh-CN" | "ja" = "en") {
  const instance = createBliverI18n(locale);
  return render(
    <BliverI18nProvider instance={instance}>
      <MemoryRouter>{element}</MemoryRouter>
    </BliverI18nProvider>,
  );
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
  vi.unstubAllGlobals();
});

describe("footprint visual states", () => {
  it("turns a completed publish into an actionable map scene", async () => {
    const publish = vi.fn<PublishFootprintRouteProps["publish"]>(async () => undefined);
    renderRoute(
      <PublishFootprintRoute
        initialPoint={{ lat: 31.2, lng: 121.4 }}
        signUpload={vi.fn()}
        publish={publish}
      />,
    );

    fireEvent.change(screen.getByLabelText("Message"), {
      target: { value: "Evening by the river" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Publish footprint" }));

    await waitFor(() => expect(publish).toHaveBeenCalledOnce());
    expect(
      await screen.findByRole("heading", { name: "The moment is on the map." }),
    ).toBeVisible();
    expect(screen.getByText("Evening by the river")).toBeVisible();
    expect(
      await screen.findByRole("link", { name: /Open on map/ }),
    ).toHaveAttribute("href", "/map?lat=31.2&lng=121.4");
    expect(
      await screen.findByRole("link", { name: "See activity" }),
    ).toHaveAttribute("href", "/activity");

    fireEvent.click(screen.getByRole("button", { name: "Leave another moment" }));
    expect(screen.getByLabelText("Message")).toHaveValue("");
  });

  it("keeps the selected mood in the publish request and allows clearing it", async () => {
    const publish = vi.fn<PublishFootprintRouteProps["publish"]>(async () => undefined);
    renderRoute(
      <PublishFootprintRoute
        initialPoint={{ lat: 31.2, lng: 121.4 }}
        signUpload={vi.fn()}
        publish={publish}
      />,
    );

    fireEvent.change(screen.getByLabelText("Message"), {
      target: { value: "A calm line" },
    });
    const calm = screen.getByRole("button", { name: "Calm" });
    fireEvent.click(calm);
    expect(calm).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(calm);
    expect(calm).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(screen.getByRole("button", { name: "Radiant" }));
    fireEvent.click(screen.getByRole("button", { name: "Publish footprint" }));

    await waitFor(() => expect(publish).toHaveBeenCalledOnce());
    expect(publish.mock.calls[0]?.[0]).toMatchObject({ mood: "radiant" });
    expect(screen.getByText("Radiant")).toBeVisible();
  });

  it("presents a deliberate spatial state when no photo was attached", () => {
    const { container } = renderRoute(
      <FootprintDetailRoute
        footprint={{
          id: "without-photo",
          message: "A quiet corner",
          mood: "sad",
          visibility: "private",
          locationPrecision: "approximate",
          displayPoint: { lat: 35.6762, lng: 139.6503 },
        }}
      />,
    );

    expect(
      screen.getByText("No photo attached").closest('[role="status"]'),
    ).toBeVisible();
    expect(container.querySelector('[data-frame-mode="spatial"]')).toHaveClass("is-spatial");
    expect(container.querySelector('.moment-frame')).toHaveAttribute("data-mood-key", "low");
    expect(screen.getByText("Low tide")).toBeVisible();
    expect(container.querySelector('[data-story-layout="spatial"]')).toBeVisible();
    expect(container.querySelector(".footprint-detail__story")).toHaveTextContent("A quiet corner");
    expect(container.querySelector(".footprint-detail__media-caption")).toBeVisible();
    expect(screen.queryByText("Photo could not load")).not.toBeInTheDocument();
  });

  it.each(["zh-CN", "ja"] as const)(
    "keeps the %s detail folio day numeric",
    (locale) => {
      const { container } = renderRoute(
        <FootprintDetailRoute
          footprint={{
            id: `localized-${locale}`,
            message: "A dated moment",
            visibility: "public",
            locationPrecision: "precise",
            displayPoint: { lat: 31.2, lng: 121.4 },
            publishedAt: "2026-07-19T08:00:00.000Z",
          }}
        />,
        locale,
      );

      expect(container.querySelector(".footprint-detail__day")).toHaveTextContent(/^19$/);
    },
  );
});
