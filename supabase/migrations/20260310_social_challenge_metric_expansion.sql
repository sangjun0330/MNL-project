-- Expand social challenge metrics and add low-value leaderboard mode.

ALTER TABLE public.rnest_social_group_challenges
  DROP CONSTRAINT IF EXISTS rnest_social_group_challenges_metric_check;

ALTER TABLE public.rnest_social_group_challenges
  DROP CONSTRAINT IF EXISTS rnest_social_group_challenges_challenge_type_check;

ALTER TABLE public.rnest_social_group_challenges
  ADD CONSTRAINT rnest_social_group_challenges_metric_check
  CHECK (
    metric IN (
      'battery',
      'sleep',
      'mental',
      'stress',
      'activity',
      'caffeine',
      'mood',
      'order_completion'
    )
  );

ALTER TABLE public.rnest_social_group_challenges
  ADD CONSTRAINT rnest_social_group_challenges_challenge_type_check
  CHECK (
    challenge_type IN (
      'leaderboard',
      'low_value',
      'group_goal',
      'streak'
    )
  );
