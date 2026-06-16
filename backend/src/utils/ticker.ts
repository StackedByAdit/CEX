import { prisma } from "../prisma";

const MS_24H = 24 * 60 * 60 * 1000;

function toNum(value: { toNumber(): number } | number | null | undefined) {
    if (value == null) return null;
    return typeof value === "number" ? value : value.toNumber();
}

export async function getTickerStats(symbol: string) {
    const since = new Date(Date.now() - MS_24H);

    const [fills, priceBeforeWindow, lastFillEver] = await Promise.all([
        prisma.fill.findMany({
            where: { stock: { symbol }, createdAt: { gte: since } },
            orderBy: { createdAt: "asc" },
        }),
        prisma.fill.findFirst({
            where: { stock: { symbol }, createdAt: { lt: since } },
            orderBy: { createdAt: "desc" },
        }),
        prisma.fill.findFirst({
            where: { stock: { symbol } },
            orderBy: { createdAt: "desc" },
        }),
    ]);

    const lastPrice = toNum(lastFillEver?.price ?? null);

    if (fills.length === 0) {
        return {
            price: lastPrice,
            change24h: 0,
            high24h: lastPrice,
            low24h: lastPrice,
            volume24h: 0,
        };
    }

    const prices = fills.map((fill) => toNum(fill.price)!);
    const openPrice = toNum(priceBeforeWindow?.price) ?? prices[0]!;
    const closePrice = prices[prices.length - 1]!;
    const high24h = Math.max(...prices);
    const low24h = Math.min(...prices);
    const volume24h = fills.reduce((sum, fill) => sum + toNum(fill.quantity)!, 0);
    const change24h = openPrice > 0 ? ((closePrice - openPrice) / openPrice) * 100 : 0;

    return {
        price: lastPrice ?? closePrice,
        change24h,
        high24h,
        low24h,
        volume24h,
    };
}
