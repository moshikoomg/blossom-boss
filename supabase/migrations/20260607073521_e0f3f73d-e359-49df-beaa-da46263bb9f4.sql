UPDATE public.lead_scans SET status = 'failed', updated_at = now() WHERE status = 'scanning' AND created_at < now() - interval '15 minutes';
