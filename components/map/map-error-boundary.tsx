"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { reportOperationalError } from "@/lib/errors";

type MapErrorBoundaryProps = { children: ReactNode };
type MapErrorBoundaryState = { failed: boolean };

export class MapErrorBoundary extends Component<
  MapErrorBoundaryProps,
  MapErrorBoundaryState
> {
  state: MapErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): MapErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportOperationalError(error, "map-render");
    if (process.env.NODE_ENV !== "production") {
      console.warn("[story-map:map-render:component-stack]", {
        componentStack: info.componentStack,
      });
    }
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="map-load-failure" role="alert">
          <span aria-hidden="true">⌁</span>
          <h2>地图暂时无法打开</h2>
          <p>地图组件加载失败。请检查网络，然后重新加载页面。</p>
          <button
            className="primary-button"
            type="button"
            onClick={() => window.location.reload()}
          >
            重新加载地图
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
