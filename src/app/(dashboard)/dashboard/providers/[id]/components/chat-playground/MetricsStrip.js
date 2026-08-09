import PropTypes from "prop-types";
import { Tooltip } from "@/shared/components";
import { formatDuration, formatTokens } from "./metrics";

export default function MetricsStrip({ metrics }) {
  if (!metrics) return null;

  const approx = metrics.exact ? "" : "~";
  const tps = metrics.tps > 0 ? `${approx}${metrics.tps.toFixed(1)} tok/s` : null;

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-text-muted">
      <Tooltip text="Time to first token">
        <span>TTFT {formatDuration(metrics.ttftMs)}</span>
      </Tooltip>
      {tps && (
        <>
          <span className="text-text-muted/40">·</span>
          <Tooltip
            text={metrics.exact
              ? "Output tokens per second, measured after the first token"
              : "Estimated — this provider returned no usage data"}
          >
            <span className={metrics.exact ? "text-primary" : undefined}>{tps}</span>
          </Tooltip>
        </>
      )}
      <span className="text-text-muted/40">·</span>
      <span>
        in {metrics.inTokens > 0 ? formatTokens(metrics.inTokens) : "—"} / out {approx}
        {formatTokens(metrics.outTokens)}
      </span>
      <span className="text-text-muted/40">·</span>
      <span>{formatDuration(metrics.totalMs)}</span>
    </div>
  );
}

MetricsStrip.propTypes = {
  metrics: PropTypes.shape({
    ttftMs: PropTypes.number,
    totalMs: PropTypes.number,
    inTokens: PropTypes.number,
    outTokens: PropTypes.number,
    tps: PropTypes.number,
    exact: PropTypes.bool,
  }),
};
