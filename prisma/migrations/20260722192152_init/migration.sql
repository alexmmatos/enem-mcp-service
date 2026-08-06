-- CreateTable
CREATE TABLE "Question" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "topic" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "statement" TEXT NOT NULL,
    "code" TEXT,
    "alternativesJson" TEXT NOT NULL,
    "correctAlternativeId" TEXT NOT NULL,
    "explanation" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "ExamAttempt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "sessionId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'in_progress',
    "topic" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "questionIdsJson" TEXT NOT NULL,
    "currentQuestionIndex" INTEGER NOT NULL DEFAULT 0,
    "score" INTEGER NOT NULL DEFAULT 0,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "finishedAt" DATETIME
);

-- CreateTable
CREATE TABLE "ExamAnswer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "examId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "selectedAlternativeId" TEXT NOT NULL,
    "correct" BOOLEAN NOT NULL,
    "answeredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExamAnswer_examId_fkey" FOREIGN KEY ("examId") REFERENCES "ExamAttempt" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ExamAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Question_topic_level_idx" ON "Question"("topic", "level");

-- CreateIndex
CREATE INDEX "ExamAttempt_userId_idx" ON "ExamAttempt"("userId");

-- CreateIndex
CREATE INDEX "ExamAttempt_sessionId_idx" ON "ExamAttempt"("sessionId");

-- CreateIndex
CREATE INDEX "ExamAttempt_status_idx" ON "ExamAttempt"("status");

-- CreateIndex
CREATE INDEX "ExamAnswer_examId_idx" ON "ExamAnswer"("examId");

-- CreateIndex
CREATE UNIQUE INDEX "ExamAnswer_examId_questionId_key" ON "ExamAnswer"("examId", "questionId");
