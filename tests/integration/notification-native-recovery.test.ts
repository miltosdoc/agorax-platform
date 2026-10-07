import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  viewer: { id: 1 as number | null },
  schedule: vi.fn(),
  createChannel: vi.fn(),
}));

vi.mock('../../client/src/lib/queryClient', () => ({
  apiRequest: mocks.apiRequest,
  queryClient: { getQueryData: () => mocks.viewer.id === null ? null : { id: mocks.viewer.id } },
}));
vi.mock('../../client/src/hooks/use-auth', () => ({ useAuth: vi.fn() }));
vi.mock('../../client/src/hooks/use-toast', () => ({ useToast: vi.fn() }));
vi.mock('../../client/src/hooks/use-translation', () => ({ useTranslation: vi.fn() }));

import { recoverInitialNativeNotification } from '../../client/src/hooks/use-notifications';

function responseFor(viewerId: number) {
  return { json: async () => ({ notifications: [{ userId: viewerId, title: 'New reply', message: 'A reply in your community.' }] }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.schedule.mockResolvedValue(undefined);
  mocks.createChannel.mockResolvedValue(undefined);
  vi.stubGlobal('window', { Capacitor: { isNativePlatform: () => true, Plugins: { LocalNotifications: { schedule: mocks.schedule, createChannel: mocks.createChannel } } } });
});
afterEach(() => vi.unstubAllGlobals());

describe('native unread recovery across UI mounts', () => {
  it('decodes the response and announces once across concurrent effects, remounts and count increases', async () => {
    mocks.viewer.id = 101;
    let resolveResponse!: (value: ReturnType<typeof responseFor>) => void;
    mocks.apiRequest.mockReturnValue(new Promise(resolve => { resolveResponse = resolve; }));
    const firstEffect = recoverInitialNativeNotification(101, 2);
    await recoverInitialNativeNotification(101, 2);
    resolveResponse(responseFor(101));
    await firstEffect;
    await recoverInitialNativeNotification(101, 2);
    await recoverInitialNativeNotification(101, 3);
    expect(mocks.apiRequest).toHaveBeenCalledTimes(1);
    expect(mocks.schedule).toHaveBeenCalledTimes(1);
    expect(mocks.schedule.mock.calls[0][0].notifications[0]).toMatchObject({ title: 'New reply', body: 'A reply in your community.' });
  });

  it('does not announce an old recipient after the signed-in viewer changes during the request', async () => {
    mocks.viewer.id = 102;
    let resolveResponse!: (value: ReturnType<typeof responseFor>) => void;
    mocks.apiRequest.mockReturnValue(new Promise(resolve => { resolveResponse = resolve; }));
    const recovery = recoverInitialNativeNotification(102, 1);
    mocks.viewer.id = 103;
    resolveResponse(responseFor(102));
    await recovery;
    expect(mocks.schedule).not.toHaveBeenCalled();
  });

  it('rechecks identity after asynchronous channel preparation', async () => {
    mocks.viewer.id = 104;
    mocks.apiRequest.mockResolvedValue(responseFor(104));
    mocks.createChannel.mockImplementation(async () => { mocks.viewer.id = null; });
    await recoverInitialNativeNotification(104, 1);
    expect(mocks.schedule).not.toHaveBeenCalled();
  });

  it('does not replay later SSE notifications when the initial load had no unread items', async () => {
    mocks.viewer.id = 105;
    await recoverInitialNativeNotification(105, 0);
    await recoverInitialNativeNotification(105, 1);
    expect(mocks.apiRequest).not.toHaveBeenCalled();
    expect(mocks.schedule).not.toHaveBeenCalled();
  });

  it('allows a different signed-in viewer their own single initial recovery', async () => {
    mocks.viewer.id = 106;
    mocks.apiRequest.mockResolvedValue(responseFor(106));
    await recoverInitialNativeNotification(106, 1);
    mocks.viewer.id = 107;
    mocks.apiRequest.mockResolvedValue(responseFor(107));
    await recoverInitialNativeNotification(107, 1);
    expect(mocks.schedule).toHaveBeenCalledTimes(2);
  });
});
