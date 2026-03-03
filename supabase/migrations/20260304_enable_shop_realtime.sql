DO $$
BEGIN
  BEGIN
    ALTER TABLE public.shop_orders REPLICA IDENTITY FULL;
  EXCEPTION
    WHEN undefined_table THEN NULL;
  END;

  BEGIN
    ALTER TABLE public.rnest_user_state REPLICA IDENTITY FULL;
  EXCEPTION
    WHEN undefined_table THEN NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.shop_orders;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_object THEN NULL;
    WHEN undefined_table THEN NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.rnest_user_state;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_object THEN NULL;
    WHEN undefined_table THEN NULL;
  END;
END
$$;

