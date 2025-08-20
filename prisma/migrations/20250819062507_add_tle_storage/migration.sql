-- CreateTable
CREATE TABLE "Tle" (
    "noradId" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT,
    "line1" TEXT NOT NULL,
    "line2" TEXT NOT NULL,
    "epoch" DATETIME NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'celestrak',
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "TleHistory" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "noradId" INTEGER NOT NULL,
    "line1" TEXT NOT NULL,
    "line2" TEXT NOT NULL,
    "epoch" DATETIME NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'celestrak',
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "Tle_epoch_idx" ON "Tle"("epoch");

-- CreateIndex
CREATE INDEX "TleHistory_noradId_fetchedAt_idx" ON "TleHistory"("noradId", "fetchedAt");
