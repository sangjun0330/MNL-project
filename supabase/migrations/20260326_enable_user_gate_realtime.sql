DO $$
BEGIN
  BEGIN
    ALTER TABLE public.rnest_users REPLICA IDENTITY FULL;
  EXCEPTION
    WHEN undefined_table THEN NULL;
  END;

  BEGIN
    ALTER TABLE public.user_service_consents REPLICA IDENTITY FULL;
  EXCEPTION
    WHEN undefined_table THEN NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.rnest_users;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_object THEN NULL;
    WHEN undefined_table THEN NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_service_consents;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_object THEN NULL;
    WHEN undefined_table THEN NULL;
  END;
END
$$;
