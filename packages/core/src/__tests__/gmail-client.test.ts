/**
 * GmailClient.request のリトライとエラーチャネルのテスト。
 *
 * 背景: 429 のときだけ指数バックオフで最大 3 回リトライし、それ以外の HTTP エラーと
 * レスポンスのデコード失敗はリトライせずにそのまま失敗させる、という方針を固定する。
 * バックオフの待ち時間は TestClock で進める。
 */
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { Effect, Exit, Fiber, Schema } from "effect";
import { TestClock } from "effect/testing";
import { makeGmailClient } from "../gmail/client.js";

const BodySchema = Schema.Struct({ ok: Schema.Boolean });

/** fetch を、呼ばれるたびに responses の順で応答するモックに差し替える（尽きたら最後の応答を返し続ける）。 */
function mockFetch(responses: Array<{ status: number; body: unknown }>) {
  let call = 0;
  const fetchMock = vi.fn(async () => {
    const { status, body } = responses[Math.min(call++, responses.length - 1)];
    return new Response(JSON.stringify(body), { status });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** request を実行し、バックオフの待ち時間（1 + 2 + 4 秒）を進めてから結果を返す。 */
function runRequest() {
  const program = Effect.gen(function* () {
    const fiber = yield* Effect.forkChild(makeGmailClient("token").request("/threads", BodySchema));
    yield* TestClock.adjust("10 seconds");
    return yield* Effect.exit(Fiber.join(fiber));
  }).pipe(Effect.provide(TestClock.layer()));
  return Effect.runPromise(program);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("makeGmailClient.request", () => {
  it("429 が続く間は 3 回までリトライし、最後の GmailApiError で失敗する", async () => {
    const fetchMock = mockFetch([{ status: 429, body: {} }]);
    const exit = await runRequest();
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      expect(exit.cause.reasons[0]).toMatchObject({
        _tag: "Fail",
        error: { _tag: "GmailApiError", status: 429 },
      });
    }
  });

  it("429 のリトライは 1・2・4 秒の間隔で行う", async () => {
    const fetchMock = mockFetch([{ status: 429, body: {} }]);
    // 各時点までに呼ばれているべき累計回数。境界の直前（-1ms）では 1 つ前の回数に留まる。
    const checkpoints: Array<[ms: number, calls: number]> = [
      [0, 1],
      [999, 1],
      [1000, 2],
      [2999, 2],
      [3000, 3],
      [6999, 3],
      [7000, 4],
    ];
    const observed = await Effect.runPromise(
      Effect.gen(function* () {
        const fiber = yield* Effect.forkChild(
          makeGmailClient("token").request("/threads", BodySchema),
        );
        const counts: Array<[number, number]> = [];
        let elapsed = 0;
        for (const [ms] of checkpoints) {
          yield* TestClock.adjust(`${ms - elapsed} millis`);
          elapsed = ms;
          counts.push([ms, fetchMock.mock.calls.length]);
        }
        yield* Effect.exit(Fiber.join(fiber));
        return counts;
      }).pipe(Effect.provide(TestClock.layer())),
    );
    expect(observed).toEqual(checkpoints);
  });

  it("429 の後に成功すれば、デコードした値を返す", async () => {
    const fetchMock = mockFetch([
      { status: 429, body: {} },
      { status: 200, body: { ok: true } },
    ]);
    const exit = await runRequest();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(exit).toEqual(Exit.succeed({ ok: true }));
  });

  it("429 以外の HTTP エラーはリトライしない", async () => {
    const fetchMock = mockFetch([{ status: 500, body: {} }]);
    const exit = await runRequest();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    if (Exit.isFailure(exit)) {
      expect(exit.cause.reasons[0]).toMatchObject({
        error: { _tag: "GmailApiError", status: 500 },
      });
    } else {
      expect.unreachable("500 は失敗するはず");
    }
  });

  it("レスポンスが Schema に合わなければ、リトライせず SchemaError で失敗する", async () => {
    const fetchMock = mockFetch([{ status: 200, body: { ok: "yes" } }]);
    const exit = await runRequest();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    if (Exit.isFailure(exit)) {
      expect(exit.cause.reasons[0]).toMatchObject({ error: { _tag: "SchemaError" } });
    } else {
      expect.unreachable("デコード失敗は失敗するはず");
    }
  });
});
