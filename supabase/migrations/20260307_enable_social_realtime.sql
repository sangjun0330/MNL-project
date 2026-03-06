DO $$
BEGIN
  BEGIN
    ALTER TABLE public.rnest_connections REPLICA IDENTITY FULL;
  EXCEPTION
    WHEN undefined_table THEN NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.rnest_connections;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_object THEN NULL;
    WHEN undefined_table THEN NULL;
  END;
END
$$;
