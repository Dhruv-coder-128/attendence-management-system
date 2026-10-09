-- =====================================================================
-- RUPAREL ATTENDANCE ERP — PARENT INVITATIONS & SECURE TELEGRAM LINKING
-- Migration: 20261009000002_parent_invitations_and_linking.sql
-- Description: Adds parent invitations tracking, secure linking tokens,
--              atomic token verification function, and attendance alert tracking.
-- =====================================================================

-- 1. PARENT INVITATIONS TABLE
CREATE TABLE IF NOT EXISTS public.parent_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_id UUID NOT NULL REFERENCES public.parents(id) ON DELETE CASCADE,
    token VARCHAR(64) UNIQUE NOT NULL,
    invitation_channel VARCHAR(20) NOT NULL DEFAULT 'telegram' CHECK (invitation_channel IN ('telegram', 'whatsapp', 'sms', 'manual')),
    invitation_status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (invitation_status IN ('pending', 'sent', 'failed', 'delivered')),
    linking_status VARCHAR(20) NOT NULL DEFAULT 'unlinked' CHECK (linking_status IN ('unlinked', 'linked', 'expired', 'revoked')),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (timezone('utc'::text, now()) + INTERVAL '7 days'),
    sent_at TIMESTAMPTZ,
    linked_at TIMESTAMPTZ,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 2. INDEXES
CREATE INDEX IF NOT EXISTS idx_parent_invitations_parent_id ON public.parent_invitations(parent_id);
CREATE INDEX IF NOT EXISTS idx_parent_invitations_token ON public.parent_invitations(token);
CREATE INDEX IF NOT EXISTS idx_parent_invitations_linking_status ON public.parent_invitations(linking_status);
CREATE INDEX IF NOT EXISTS idx_parent_invitations_expires_at ON public.parent_invitations(expires_at);

-- 3. EXTEND PARENTS TABLE (Convenience / caching columns)
ALTER TABLE public.parents ADD COLUMN IF NOT EXISTS linking_token VARCHAR(64);
ALTER TABLE public.parents ADD COLUMN IF NOT EXISTS linking_token_expires_at TIMESTAMPTZ;
ALTER TABLE public.parents ADD COLUMN IF NOT EXISTS invitation_status VARCHAR(20) DEFAULT 'uninvited';
ALTER TABLE public.parents ADD COLUMN IF NOT EXISTS invitation_sent_at TIMESTAMPTZ;

-- 4. EXTEND ATTENDANCE TABLE (Delivery error and status logging)
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS telegram_error TEXT;
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS telegram_delivery_status VARCHAR(20) DEFAULT 'unnotified';

-- 5. ROW LEVEL SECURITY (RLS) FOR PARENT_INVITATIONS
ALTER TABLE public.parent_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view parent_invitations"
    ON public.parent_invitations FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert parent_invitations"
    ON public.parent_invitations FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update parent_invitations"
    ON public.parent_invitations FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete parent_invitations"
    ON public.parent_invitations FOR DELETE TO authenticated USING (true);

-- 6. ATOMIC TELEGRAM LINKING RPC FUNCTION (SECURITY DEFINER)
-- Allows the Telegram Bot webhook to safely link the parent chat ID
-- without exposing full service role keys or client permissions.
CREATE OR REPLACE FUNCTION public.link_parent_telegram_by_token(
    p_token VARCHAR(64),
    p_chat_id VARCHAR(100)
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_invitation RECORD;
    v_parent RECORD;
BEGIN
    -- 1. Locate the invitation by unique token
    SELECT * INTO v_invitation
    FROM public.parent_invitations
    WHERE token = p_token
    FOR UPDATE;

    -- Fallback: check parents.linking_token if table was just migrated
    IF NOT FOUND THEN
        SELECT id, full_name, linking_token_expires_at INTO v_parent
        FROM public.parents
        WHERE linking_token = p_token
        FOR UPDATE;

        IF NOT FOUND THEN
            RETURN jsonb_build_object(
                'success', false,
                'error_code', 'INVALID_TOKEN',
                'error', 'Invalid linking token. Please ensure you clicked the complete link provided by Ruparel Academy.'
            );
        END IF;

        IF v_parent.linking_token_expires_at IS NOT NULL AND v_parent.linking_token_expires_at < now() THEN
            RETURN jsonb_build_object(
                'success', false,
                'error_code', 'EXPIRED_TOKEN',
                'error', 'This invitation link has expired. Please request a new invitation from Ruparel Academy.'
            );
        END IF;

        -- Link parent record
        UPDATE public.parents
        SET telegram_chat_id = p_chat_id,
            is_verified = true,
            preferred_notification_channel = 'telegram',
            invitation_status = 'linked',
            linking_token = NULL,
            updated_at = now()
        WHERE id = v_parent.id;

        RETURN jsonb_build_object(
            'success', true,
            'parent_id', v_parent.id,
            'parent_name', v_parent.full_name
        );
    END IF;

    -- 2. Check if already linked
    IF v_invitation.linking_status = 'linked' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error_code', 'ALREADY_LINKED',
            'error', 'This invitation token has already been used and cannot be reused.'
        );
    END IF;

    -- 3. Check token expiration
    IF v_invitation.expires_at < now() THEN
        UPDATE public.parent_invitations
        SET linking_status = 'expired', updated_at = now()
        WHERE id = v_invitation.id;

        RETURN jsonb_build_object(
            'success', false,
            'error_code', 'EXPIRED_TOKEN',
            'error', 'This invitation link has expired. Please request a fresh invitation from Ruparel Academy.'
        );
    END IF;

    -- 4. Check if token was revoked
    IF v_invitation.linking_status = 'revoked' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error_code', 'REVOKED_TOKEN',
            'error', 'This invitation link has been revoked.'
        );
    END IF;

    -- 5. Fetch linked parent
    SELECT id, full_name INTO v_parent
    FROM public.parents
    WHERE id = v_invitation.parent_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error_code', 'PARENT_NOT_FOUND',
            'error', 'Guardian account associated with this token was not found.'
        );
    END IF;

    -- 6. Atomically update parent and invitation records
    UPDATE public.parents
    SET telegram_chat_id = p_chat_id,
        is_verified = true,
        preferred_notification_channel = 'telegram',
        invitation_status = 'linked',
        updated_at = now()
    WHERE id = v_invitation.parent_id;

    UPDATE public.parent_invitations
    SET linking_status = 'linked',
        invitation_status = 'delivered',
        linked_at = now(),
        updated_at = now()
    WHERE id = v_invitation.id;

    RETURN jsonb_build_object(
        'success', true,
        'parent_id', v_parent.id,
        'parent_name', v_parent.full_name
    );
END;
$$;
