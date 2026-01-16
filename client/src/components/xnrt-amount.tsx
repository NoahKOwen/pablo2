// client/src/components/xnrt-amount.tsx
type XnrtAmountProps = {
  amount: number | string | bigint | null | undefined;
  showTokenLabel?: boolean; // agar "XNRT" text bhi dikhana ho
};

function toNumber(value: XnrtAmountProps["amount"]): number {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") return parseFloat(value || "0");
  return 0;
}

// 1 USDT = 100 XNRT
const XNRT_PER_USDT = 100;

export function XnrtAmount({ amount, showTokenLabel = true }: XnrtAmountProps) {
  const xnrt = toNumber(amount);
  const usdt = xnrt / XNRT_PER_USDT;

  return (
    <div className="flex flex-col leading-tight">
      <span className="font-semibold">
        {xnrt.toLocaleString()}
        {showTokenLabel && " XNRT"}
      </span>
      <span className="text-xs text-muted-foreground">
        ≈ $
        {usdt.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}{" "}
        USDT
      </span>
    </div>
  );
}
