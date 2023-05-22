import dayjs from 'dayjs';
import { edgeCacheIt } from '~/server/middleware.trpc';
import {
  getLeaderboardPositionsSchema,
  getLeaderboardSchema,
} from '~/server/schema/leaderboard.schema';
import {
  getLeaderboard,
  getLeaderboards,
  getLeaderboardPositions,
} from '~/server/services/leaderboard.service';
import { publicProcedure, router } from '~/server/trpc';

const expireAt = () => dayjs().add(1, 'day').startOf('day').toDate();

export const leaderboardRouter = router({
  getLeaderboards: publicProcedure.query(({ ctx }) =>
    getLeaderboards({ isModerator: ctx?.user?.isModerator ?? false })
  ),
  getLeaderboardPositions: publicProcedure
    .input(getLeaderboardPositionsSchema)
    .query(({ input, ctx }) =>
      getLeaderboardPositions({
        ...input,
        userId: input.userId ?? ctx.user?.id,
        isModerator: ctx?.user?.isModerator ?? false,
      })
    ),
  getLeaderboard: publicProcedure
    .input(getLeaderboardSchema)
    .use(edgeCacheIt({ expireAt }))
    .query(({ input, ctx }) =>
      getLeaderboard({ ...input, isModerator: ctx?.user?.isModerator ?? false })
    ),
});