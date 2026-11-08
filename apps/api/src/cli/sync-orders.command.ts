import { Command, CommandRunner, Option } from 'nest-commander';
import { addDays, isIsoDate, kstDate } from '../common/kst';
import { CoupangConnectionService } from '../coupang/coupang-connection.service';
import { CoupangOrdersLoader } from '../coupang/loaders/coupang-orders.loader';

/** Parsed CLI options. Either `days`, or both `from` and `to`. */
interface SyncOrdersOptions {
  days?: number;
  from?: string;
  to?: string;
}

const MAX_DAYS = 365;

/**
 * Loads Coupang orders for every active connection into `raw.coupang_orders`.
 * Long ranges are split into ≤31-day API windows automatically.
 * Later a scheduled job calls the same loader; the CLI stays for manual backfills.
 *
 * @example node dist/apps/api/cli.js sync-orders              # last 7 days
 * @example node dist/apps/api/cli.js sync-orders --days 90
 * @example node dist/apps/api/cli.js sync-orders --from 2026-01-01 --to 2026-03-31
 */
@Command({ name: 'sync-orders', description: 'Load Coupang order sheets into raw.coupang_orders' })
export class SyncOrdersCommand extends CommandRunner {
  constructor(
    private readonly connections: CoupangConnectionService,
    private readonly loader: CoupangOrdersLoader,
  ) {
    super();
  }

  async run(_args: string[], opts: SyncOrdersOptions): Promise<void> {
    const window = this.resolveWindow(opts);
    if (!window) {
      process.exitCode = 1;
      return;
    }

    const active = await this.connections.listActive();
    if (active.length === 0) {
      console.error('No active connections. Run connect-coupang first.');
      process.exitCode = 1;
      return;
    }

    for (const connection of active) {
      try {
        const { windows, rows } = await this.loader.sync(connection.id, window.from, window.to);
        console.log(`${connection.vendorId}: ${rows} shipment boxes in ${windows} window(s), ${window.from}..${window.to}`);
      } catch (err) {
        console.error(`${connection.vendorId}: failed: ${(err as Error).message}`);
        process.exitCode = 1;
      }
    }
  }

  /** Days back from today (KST), inclusive. */
  @Option({ flags: '-d, --days <days>', description: `Days back from today, 1–${MAX_DAYS} (default 7)` })
  parseDays(value: string): number {
    const n = Number(value);
    if (!Number.isInteger(n) || n < 1 || n > MAX_DAYS) throw new Error(`--days must be an integer 1–${MAX_DAYS}`);
    return n;
  }

  /** Explicit start date, `yyyy-mm-dd` (KST). Requires `--to`. */
  @Option({ flags: '--from <date>', description: 'Start date yyyy-mm-dd (KST), use with --to' })
  parseFrom(value: string): string {
    if (!isIsoDate(value)) throw new Error('--from must be a valid yyyy-mm-dd date');
    return value;
  }

  /** Explicit end date, `yyyy-mm-dd` (KST). Requires `--from`. */
  @Option({ flags: '--to <date>', description: 'End date yyyy-mm-dd (KST), use with --from' })
  parseTo(value: string): string {
    if (!isIsoDate(value)) throw new Error('--to must be a valid yyyy-mm-dd date');
    return value;
  }

  /** Turns the options into one window, or prints an error and returns `undefined`. */
  private resolveWindow(opts: SyncOrdersOptions): { from: string; to: string } | undefined {
    if (opts.from || opts.to) {
      if (!opts.from || !opts.to || opts.days !== undefined) {
        console.error('Use either --days, or both --from and --to.');
        return undefined;
      }
      if (opts.from > opts.to) {
        console.error('--from must not be after --to.');
        return undefined;
      }
      return { from: opts.from, to: opts.to };
    }
    const to = kstDate();
    return { from: addDays(to, -((opts.days ?? 7) - 1)), to };
  }
}
