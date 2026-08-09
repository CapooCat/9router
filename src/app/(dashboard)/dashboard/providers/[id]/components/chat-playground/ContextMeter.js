import PropTypes from "prop-types";
import { formatTokens } from "./metrics";

export default function ContextMeter({ used, contextWindow, maxOutput, estimated }) {
  if (!contextWindow) return null;

  const pct = Math.min(100, Math.max(0, (used / contextWindow) * 100));
  const barColor = pct >= 90 ? "bg-red-500" : pct >= 75 ? "bg-yellow-500" : "bg-brand-500";

  return (
    <div className="mt-3 flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-[11px] text-text-muted">
        <span>
          Context {estimated && used > 0 ? "~" : ""}{formatTokens(used)} / {formatTokens(contextWindow)}
          {used > 0 && <span className="ml-1 text-text-muted/70">({pct < 1 ? "<1" : Math.round(pct)}%)</span>}
        </span>
        {maxOutput > 0 && <span>max out {formatTokens(maxOutput)}</span>}
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
        <div className={`h-full rounded-full transition-all duration-300 ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

ContextMeter.propTypes = {
  used: PropTypes.number,
  contextWindow: PropTypes.number,
  maxOutput: PropTypes.number,
  estimated: PropTypes.bool,
};
