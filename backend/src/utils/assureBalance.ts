import { prisma } from "../prisma";
import { BALANCES } from "../state";

export async function assureBalance(userId: string, symbol: string) {
    if (!BALANCES[userId]) BALANCES[userId] = {};

    if (BALANCES[userId]![symbol]) {
        return BALANCES[userId]![symbol]!;
    }

    if (symbol === "INR") {
        let balance = await prisma.balance.findFirst({
            where: { userId, assetType: "INR" }
        });

        if (!balance) {
            balance = await prisma.balance.create({
                data: { userId, stockId: null, assetType: "INR", available: 0, locked: 0 }
            });
        }

        BALANCES[userId]![symbol] = {
            available: balance.available.toNumber(),
            locked: balance.locked.toNumber(),
            balanceId: balance.id
        };

        return BALANCES[userId]![symbol]!;
    }

    const stock = await prisma.stock.findUnique({ where: { symbol } });

    if (!stock) throw new Error(`Stock not found: ${symbol}`);

    let balance = await prisma.balance.findFirst({
        where: { userId, assetType: "STOCK", stockId: stock.id }
    });

    if (!balance) {
        balance = await prisma.balance.create({
            data: { userId, stockId: stock.id, assetType: "STOCK", available: 0, locked: 0 }
        });
    }

    BALANCES[userId]![symbol] = {
        available: balance.available.toNumber(),
        locked: balance.locked.toNumber(),
        balanceId: balance.id
    };

    return BALANCES[userId]![symbol]!;
}