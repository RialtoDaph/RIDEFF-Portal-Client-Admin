/* eslint-disable @next/next/no-img-element -- 22px static mark, no optimisation needed */
export function BrandMark({ size = 22 }: { size?: 22 | 26 }) {
  const big = size === 26;
  return (
    <img
      src="/rideff-mark.png"
      alt=""
      width={size}
      height={size}
      className={`block bg-brand ${big ? "rounded-[7px] p-[5px]" : "rounded-[6px] p-1"}`}
      style={{ width: size, height: size }}
    />
  );
}
