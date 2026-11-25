export interface AssetScale {
    decimals: number;
    unitName: string;
}

export const PRICE_DECIMALS = 2;
export const INR_DECIMALS = 2;

export const ASSET_SCALES: Record<string, AssetScale> = {
    INR: { decimals: INR_DECIMALS, unitName: "paise" },
    SOL: { decimals: 9, unitName: "lamports" },
    BTC: { decimals: 8, unitName: "satoshis" },
    ETH: { decimals: 18, unitName: "wei" },
    AXIS: { decimals: 4, unitName: "units" },
    HDFC: { decimals: 4, unitName: "units" },
};

export function getAssetScale(symbol: string): AssetScale {
    const sym = symbol.toUpperCase();
    return ASSET_SCALES[sym] ?? { decimals: 4, unitName: "units" };
}

export function parseUnits(value: string | number, decimals: number): bigint {
    if (typeof value === "bigint") {
        return value;
    }

    let str = typeof value === "number"
        ? (Number.isInteger(value) ? value.toString() : value.toFixed(Math.max(decimals, 8)))
        : String(value).trim();

    if (!str || str === "NaN") {
        throw new Error(`Invalid numeric input: "${value}"`);
    }

    const isNeg = str.startsWith("-");
    if (isNeg) {
        str = str.slice(1);
    }

    if (/[eE]/.test(str)) {
        const num = Number(str);
        if (!Number.isFinite(num)) {
            throw new Error(`Invalid numeric input: "${value}"`);
        }
        str = num.toFixed(Math.max(decimals, 18));
    }

    const parts = str.split(".");
    if (parts.length > 2) {
        throw new Error(`Invalid numeric input (multiple decimal points): "${value}"`);
    }

    const intPart = parts[0] || "0";
    let fracPart = parts[1] || "";

    if (!/^\d+$/.test(intPart) || (fracPart && !/^\d+$/.test(fracPart))) {
        throw new Error(`Invalid numeric input: "${value}"`);
    }

    if (fracPart.length > decimals) {
        const nextDigit = Number(fracPart[decimals]);
        let roundedFrac = BigInt(fracPart.slice(0, decimals));
        if (nextDigit >= 5) {
            roundedFrac += 1n;
        }
        fracPart = roundedFrac.toString().padStart(decimals, "0");
    } else {
        fracPart = fracPart.padEnd(decimals, "0");
    }

    const multiplier = 10n ** BigInt(decimals);
    const result = BigInt(intPart) * multiplier + BigInt(fracPart);
    return isNeg ? -result : result;
}

export function formatUnits(value: bigint, decimals: number): string {
    const isNeg = value < 0n;
    const abs = isNeg ? -value : value;
    const divisor = 10n ** BigInt(decimals);
    const intPart = abs / divisor;
    const fracPart = (abs % divisor).toString().padStart(decimals, "0");

    if (decimals === 0) {
        return isNeg ? `-${intPart.toString()}` : intPart.toString();
    }

    const res = `${intPart.toString()}.${fracPart}`;
    return isNeg ? `-${res}` : res;
}

export function unitsToNumber(value: bigint, decimals: number): number {
    return Number(formatUnits(value, decimals));
}

export function parsePrice(price: string | number): bigint {
    return parseUnits(price, PRICE_DECIMALS);
}

export function formatPrice(price: bigint): number {
    return unitsToNumber(price, PRICE_DECIMALS);
}

export function priceToDecimalString(price: bigint): string {
    return formatUnits(price, PRICE_DECIMALS);
}

export function parseQuantity(quantity: string | number, symbol: string): bigint {
    const scale = getAssetScale(symbol);
    return parseUnits(quantity, scale.decimals);
}

export function formatQuantity(quantity: bigint, symbol: string): number {
    const scale = getAssetScale(symbol);
    return unitsToNumber(quantity, scale.decimals);
}

export function quantityToDecimalString(quantity: bigint, symbol: string): string {
    const scale = getAssetScale(symbol);
    return formatUnits(quantity, scale.decimals);
}

export function parseInr(amount: string | number): bigint {
    return parseUnits(amount, INR_DECIMALS);
}

export function formatInr(amountPaise: bigint): number {
    return unitsToNumber(amountPaise, INR_DECIMALS);
}

export function inrToDecimalString(amountPaise: bigint): string {
    return formatUnits(amountPaise, INR_DECIMALS);
}

export type RoundingMode = "half_up" | "up" | "down";

export function calculateQuote(
    baseQuantity: bigint,
    priceInPaise: bigint,
    symbol: string,
    rounding: RoundingMode = "half_up"
): bigint {
    if (baseQuantity === 0n || priceInPaise === 0n) {
        return 0n;
    }

    const scale = getAssetScale(symbol);
    const divisor = 10n ** BigInt(scale.decimals);
    const numerator = baseQuantity * priceInPaise;

    if (rounding === "up") {
        return (numerator + divisor - 1n) / divisor;
    }
    if (rounding === "down") {
        return numerator / divisor;
    }
    return (numerator + divisor / 2n) / divisor;
}

export function calculateFee(quotePaise: bigint, bps: bigint, rounding: RoundingMode = "up"): bigint {
    if (quotePaise === 0n || bps === 0n) {
        return 0n;
    }
    const divisor = 10_000n;
    const numerator = quotePaise * bps;
    if (rounding === "up") {
        return (numerator + divisor - 1n) / divisor;
    }
    if (rounding === "down") {
        return numerator / divisor;
    }
    return (numerator + divisor / 2n) / divisor;
}
