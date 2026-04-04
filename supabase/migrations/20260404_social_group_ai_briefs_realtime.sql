DO $$
BEGIN
  BEGIN
    ALTER TABLE public.rnest_social_group_ai_briefs REPLICA IDENTITY FULL;
  EXCEPTION
    WHEN undefined_table THEN NULL;
  END;

  BEGIN
    ALTER TABLE public.rnest_social_group_ai_card_prefs REPLICA IDENTITY FULL;
  EXCEPTION
    WHEN undefined_table THEN NULL;
  END;

  BEGIN
    ALTER TABLE public.rnest_social_group_members REPLICA IDENTITY FULL;
  EXCEPTION
    WHEN undefined_table THEN NULL;
  END;

  BEGIN
    ALTER TABLE public.rnest_social_preferences REPLICA IDENTITY FULL;
  EXCEPTION
    WHEN undefined_table THEN NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.rnest_social_group_ai_briefs;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_object THEN NULL;
    WHEN undefined_table THEN NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.rnest_social_group_ai_card_prefs;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_object THEN NULL;
    WHEN undefined_table THEN NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.rnest_social_group_members;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_object THEN NULL;
    WHEN undefined_table THEN NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.rnest_social_preferences;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_object THEN NULL;
    WHEN undefined_table THEN NULL;
  END;
END
$$;
