-- Patch deployed databases so the social challenge metric constraint also accepts order completion.

ALTER TABLE public.rnest_social_group_challenges
  DROP CONSTRAINT IF EXISTS rnest_social_group_challenges_metric_check;

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
