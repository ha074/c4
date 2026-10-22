-- =============================================================================
-- 匿名聊天室：階段二資料庫（架構文件第 3.2、5.4、6、9 節）
--
-- 怎麼執行（不用 Supabase CLI）：
--   Supabase 後台 → SQL Editor → New query → 把這整個檔案貼上 → Run。
--   可以重複執行：已經建過的東西會被更新，不會重複建立。
--
-- 規則數字要和 src/chat/rules.ts 一樣：
--   代號 1～16 字、訊息最多 500 字、每人每 10 秒最多 5 則、每分鐘最多 3 張圖、
--   最近 50 則、60 秒沒心跳就釋放代號、訊息保留 7 天、圖片 2 MB。
-- =============================================================================

-- 先前手動建的 messages 表欄位不相容：改名留著備份，不刪資料
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'messages')
     and not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'messages' and column_name = 'system_type') then
    execute 'alter table public.messages rename to messages_legacy_backup';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 資料表
-- ---------------------------------------------------------------------------

-- 管理員名單：只有你能在後台加入
create table if not exists public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- 目前誰佔用哪個代號。nickname_key（統一字形＋小寫）唯一，資料庫保證代號不重複
create table if not exists public.members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  nickname text not null,
  nickname_key text not null unique,
  is_admin boolean not null default false,
  joined_at timestamptz not null default now(),
  last_seen timestamptz not null default now()
);

-- 封鎖名單。until 是 null 代表永久
create table if not exists public.bans (
  user_id uuid primary key,
  until timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid
);

-- 所有訊息（包括系統訊息）
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('user', 'system')),
  created_at timestamptz not null default now(),
  author_id uuid,
  nickname text not null,
  is_admin boolean not null default false,
  text text not null default '' check (char_length(text) <= 500),
  image_path text,
  image_width integer,
  image_height integer,
  mentions text[] not null default '{}',
  edited_at timestamptz,
  status text not null default 'normal' check (status in ('normal', 'recalled', 'removed')),
  system_type text check (system_type in ('join', 'leave', 'kicked'))
);
create index if not exists messages_created_at_idx on public.messages (created_at desc);
create index if not exists messages_author_recent_idx on public.messages (author_id, created_at desc);

-- 每台裝置的通知設定（推播訂閱的欄位留給之後的 Web Push）
create table if not exists public.push_subscriptions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  notify_mode text not null default 'mentions' check (notify_mode in ('all', 'mentions', 'off')),
  endpoint text,
  keys jsonb,
  nickname text,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 權限：網頁只能「讀訊息」和「呼叫下面的函式」，不能直接寫任何資料表（架構文件 3.2）
-- ---------------------------------------------------------------------------
alter table public.admins enable row level security;
alter table public.members enable row level security;
alter table public.bans enable row level security;
alter table public.messages enable row level security;
alter table public.push_subscriptions enable row level security;

revoke all on public.admins, public.members, public.bans, public.messages, public.push_subscriptions from anon, authenticated;
grant select on public.messages to authenticated;

-- ---------------------------------------------------------------------------
-- 共用小工具：放在 chat_private，不會被 API 開放出去，網頁不能直接呼叫
-- ---------------------------------------------------------------------------
create schema if not exists chat_private;
revoke all on schema chat_private from public, anon;
grant usage on schema chat_private to authenticated;

create or replace function chat_private.is_banned(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.bans b
    where b.user_id = p_user and (b.until is null or b.until > now())
  );
$$;

create or replace function chat_private.ban_until(p_user uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('until', b.until)
  from public.bans b
  where b.user_id = p_user and (b.until is null or b.until > now());
$$;

create or replace function chat_private.is_admin(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admins a where a.user_id = p_user);
$$;

create or replace function chat_private.is_member(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.members m where m.user_id = p_user);
$$;

-- 一則訊息 → 畫面用的格式（架構文件 5.3）。圖片網址由前端用 imagePath 組出來
create or replace function chat_private.message_json(m public.messages)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id', m.id,
    'kind', m.kind,
    'createdAt', m.created_at,
    'authorId', m.author_id,
    'nickname', m.nickname,
    'isAdmin', m.is_admin,
    'text', m.text,
    'imagePath', m.image_path,
    'imageWidth', m.image_width,
    'imageHeight', m.image_height,
    'mentions', to_jsonb(m.mentions),
    'editedAt', m.edited_at,
    'status', m.status,
    'systemType', m.system_type
  );
$$;

create or replace function chat_private.log_system(p_type text, p_nickname text)
returns void language sql security definer set search_path = '' as $$
  insert into public.messages (kind, nickname, system_type) values ('system', p_nickname, p_type);
$$;

-- 代號規則（和 src/lib/nickname.ts 一樣）：回傳 null 代表合格，否則回傳問題
create or replace function chat_private.check_nickname(p_nickname text)
returns text language plpgsql immutable set search_path = '' as $$
declare
  n text := regexp_replace(btrim(normalize(coalesce(p_nickname, ''), NFKC)), ' {2,}', ' ', 'g');
  k text := lower(n);
begin
  if char_length(n) < 1 or char_length(n) > 16 then return 'length'; end if;
  -- 控制字元、看不見的字元
  if n ~ '[[:cntrl:]]' or n ~ '[\u00AD\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]' then return 'chars'; end if;
  -- 一般符號（底線、連字號、空格以外）
  if translate(n, '!"#$%&''()*+,./:;<=>?@[]\^`{|}~', '') <> n then return 'chars'; end if;
  -- 至少要有一個不是空白、底線、連字號的字
  if n !~ '[^ _-]' then return 'chars'; end if;
  if k in ('管理員', '管理者', '系統', 'admin', 'administrator', 'system', 'moderator', 'mod') then return 'reserved'; end if;
  return null;
end $$;

-- ---------------------------------------------------------------------------
-- 網頁能呼叫的函式（RPC）。全部用 security definer：在資料庫這一端一次檢查完規則
-- 回傳格式：{ "ok": true, ... } 或 { "ok": false, "code": "…", "until": … }
-- ---------------------------------------------------------------------------

-- 進入聊天室（架構文件 6.1）
create or replace function public.join_room(p_nickname text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  n text := regexp_replace(btrim(normalize(coalesce(p_nickname, ''), NFKC)), ' {2,}', ' ', 'g');
  k text := lower(n);
  admin boolean;
  mine public.members;
  stale record;
  ban jsonb;
begin
  if uid is null then return jsonb_build_object('ok', false, 'code', 'network'); end if;
  if chat_private.check_nickname(n) is not null then
    return jsonb_build_object('ok', false, 'code', 'nickname_invalid');
  end if;

  ban := chat_private.ban_until(uid);
  if ban is not null then return jsonb_build_object('ok', false, 'code', 'banned', 'until', ban -> 'until'); end if;

  admin := chat_private.is_admin(uid);

  select * into mine from public.members where user_id = uid;
  if found and mine.nickname_key = k then
    -- 自己在用（例如剛重新整理）：直接成功，不再寫一次「進入了聊天室」
    update public.members set last_seen = now(), nickname = n, is_admin = admin where user_id = uid;
    return jsonb_build_object('ok', true, 'user', jsonb_build_object('userId', uid, 'nickname', n, 'isAdmin', admin), 'rejoined', true);
  elsif found then
    -- 同一個瀏覽器換了代號：舊的算離開
    delete from public.members where user_id = uid;
    perform chat_private.log_system('leave', mine.nickname);
  end if;

  -- 60 秒沒心跳的人：釋放他的代號
  for stale in
    delete from public.members
    where nickname_key = k and last_seen < now() - interval '60 seconds'
    returning nickname
  loop
    perform chat_private.log_system('leave', stale.nickname);
  end loop;

  begin
    insert into public.members (user_id, nickname, nickname_key, is_admin) values (uid, n, k, admin);
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'code', 'nickname_taken');
  end;

  perform chat_private.log_system('join', n);
  return jsonb_build_object('ok', true, 'user', jsonb_build_object('userId', uid, 'nickname', n, 'isAdmin', admin), 'rejoined', false);
end $$;

-- 心跳：每 20 秒一次。代號被拿走、或被踢了，都在這裡告訴網頁
create or replace function public.heartbeat()
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  ban jsonb;
begin
  if uid is null then return jsonb_build_object('ok', false, 'code', 'network'); end if;
  ban := chat_private.ban_until(uid);
  if ban is not null then
    delete from public.members where user_id = uid;
    return jsonb_build_object('ok', false, 'code', 'banned', 'until', ban -> 'until');
  end if;
  update public.members set last_seen = now() where user_id = uid;
  if not found then return jsonb_build_object('ok', false, 'code', 'nickname_lost'); end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.leave_room()
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  gone public.members;
begin
  delete from public.members where user_id = auth.uid() returning * into gone;
  if found then perform chat_private.log_system('leave', gone.nickname); end if;
  return jsonb_build_object('ok', true);
end $$;

-- 送出訊息（架構文件 6.2）。代號、是否管理員由資料庫自己填，不採用前端傳來的值
create or replace function public.send_message(
  p_text text,
  p_image_path text default null,
  p_image_width integer default null,
  p_image_height integer default null,
  p_mentions text[] default '{}'
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  me public.members;
  t text := coalesce(p_text, '');
  ban jsonb;
  msg_row public.messages;
  clean_mentions text[];
begin
  if uid is null then return jsonb_build_object('ok', false, 'code', 'network'); end if;
  ban := chat_private.ban_until(uid);
  if ban is not null then return jsonb_build_object('ok', false, 'code', 'banned', 'until', ban -> 'until'); end if;

  select * into me from public.members where user_id = uid;
  if not found then return jsonb_build_object('ok', false, 'code', 'nickname_lost'); end if;

  if char_length(t) > 500 then return jsonb_build_object('ok', false, 'code', 'too_long'); end if;
  if btrim(t) = '' and p_image_path is null then return jsonb_build_object('ok', false, 'code', 'too_long'); end if;

  -- 圖片只能放在自己的資料夾
  if p_image_path is not null and split_part(p_image_path, '/', 1) <> uid::text then
    return jsonb_build_object('ok', false, 'code', 'image_type_not_allowed');
  end if;

  -- 洗版：每人每 10 秒最多 5 則、每分鐘最多 3 張圖
  if (select count(*) from public.messages where author_id = uid and created_at > now() - interval '10 seconds') >= 5 then
    return jsonb_build_object('ok', false, 'code', 'rate_limited');
  end if;
  if p_image_path is not null and
     (select count(*) from public.messages where author_id = uid and image_path is not null and created_at > now() - interval '60 seconds') >= 3 then
    return jsonb_build_object('ok', false, 'code', 'rate_limited');
  end if;

  -- 只留下真的出現在文字裡的 @代號，最多 20 個
  select coalesce(array_agg(distinct m), '{}') into clean_mentions
  from (select unnest(coalesce(p_mentions, '{}')) as m limit 20) s
  where position('@' || m in t) > 0 and char_length(m) between 1 and 16;

  update public.members set last_seen = now() where user_id = uid;
  insert into public.messages (kind, author_id, nickname, is_admin, text, image_path, image_width, image_height, mentions)
  values ('user', uid, me.nickname, chat_private.is_admin(uid), t, p_image_path,
          case when p_image_path is null then null else greatest(1, least(coalesce(p_image_width, 1), 10000)) end,
          case when p_image_path is null then null else greatest(1, least(coalesce(p_image_height, 1), 10000)) end,
          clean_mentions)
  returning * into msg_row;

  return jsonb_build_object('ok', true, 'message', chat_private.message_json(msg_row));
end $$;

create or replace function public.edit_message(p_id uuid, p_text text, p_mentions text[] default '{}')
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  msg_row public.messages;
  t text := coalesce(p_text, '');
  clean_mentions text[];
begin
  select * into msg_row from public.messages where id = p_id and kind = 'user' and status = 'normal';
  if not found then return jsonb_build_object('ok', false, 'code', 'message_gone'); end if;
  if msg_row.author_id is distinct from uid then return jsonb_build_object('ok', false, 'code', 'not_owner'); end if;
  if char_length(t) > 500 then return jsonb_build_object('ok', false, 'code', 'too_long'); end if;
  if btrim(t) = '' and msg_row.image_path is null then return jsonb_build_object('ok', false, 'code', 'too_long'); end if;

  select coalesce(array_agg(distinct m), '{}') into clean_mentions
  from (select unnest(coalesce(p_mentions, '{}')) as m limit 20) s
  where position('@' || m in t) > 0;

  update public.messages set text = t, mentions = clean_mentions, edited_at = now()
  where id = p_id returning * into msg_row;
  return jsonb_build_object('ok', true, 'message', chat_private.message_json(msg_row));
end $$;

-- 收回：文字和圖片從資料庫清掉（不只是藏起來），回傳舊的圖片路徑讓前端刪 Storage 裡的檔案
create or replace function public.recall_message(p_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  msg_row public.messages;
  old_path text;
begin
  select * into msg_row from public.messages where id = p_id and kind = 'user' and status = 'normal';
  if not found then return jsonb_build_object('ok', false, 'code', 'message_gone'); end if;
  if msg_row.author_id is distinct from uid then return jsonb_build_object('ok', false, 'code', 'not_owner'); end if;
  old_path := msg_row.image_path;
  update public.messages
  set status = 'recalled', text = '', image_path = null, image_width = null, image_height = null, mentions = '{}'
  where id = p_id returning * into msg_row;
  return jsonb_build_object('ok', true, 'message', chat_private.message_json(msg_row), 'deletedImagePath', old_path);
end $$;

-- 管理員登入後確認自己是不是管理員
create or replace function public.am_i_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select chat_private.is_admin(auth.uid());
$$;

create or replace function public.admin_remove_message(p_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  msg_row public.messages;
  old_path text;
begin
  if not chat_private.is_admin(auth.uid()) then return jsonb_build_object('ok', false, 'code', 'not_admin'); end if;
  select * into msg_row from public.messages where id = p_id and kind = 'user' and status = 'normal';
  if not found then return jsonb_build_object('ok', false, 'code', 'message_gone'); end if;
  old_path := msg_row.image_path;
  update public.messages
  set status = 'removed', text = '', image_path = null, image_width = null, image_height = null, mentions = '{}'
  where id = p_id returning * into msg_row;
  return jsonb_build_object('ok', true, 'message', chat_private.message_json(msg_row), 'deletedImagePath', old_path);
end $$;

-- 踢人（架構文件 6.5）。p_duration：1h / 24h / 7d / forever（永久：docs/design.md 6.2）
create or replace function public.admin_kick(p_user uuid, p_duration text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  until_at timestamptz;
  gone public.members;
  last_name text;
begin
  if not chat_private.is_admin(uid) then return jsonb_build_object('ok', false, 'code', 'not_admin'); end if;
  if p_user = uid then return jsonb_build_object('ok', false, 'code', 'not_admin'); end if;
  until_at := case p_duration
    when '1h' then now() + interval '1 hour'
    when '24h' then now() + interval '24 hours'
    when '7d' then now() + interval '7 days'
    when 'forever' then null
    else now() + interval '1 hour'
  end;

  insert into public.bans (user_id, until, created_by) values (p_user, until_at, uid)
  on conflict (user_id) do update set until = excluded.until, created_at = now(), created_by = excluded.created_by;

  delete from public.members where user_id = p_user returning * into gone;
  if found then
    last_name := gone.nickname;
  else
    select nickname into last_name from public.messages where author_id = p_user order by created_at desc limit 1;
  end if;
  if last_name is not null then perform chat_private.log_system('kicked', last_name); end if;

  -- 告訴被踢的人：切到被踢出畫面
  perform realtime.send(jsonb_build_object('userId', p_user, 'until', until_at), 'member_kicked', 'room:lobby', true);
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.set_notify_mode(p_mode text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
begin
  if auth.uid() is null or p_mode not in ('all', 'mentions', 'off') then
    return jsonb_build_object('ok', false, 'code', 'network');
  end if;
  insert into public.push_subscriptions (user_id, notify_mode, nickname, updated_at)
  values (auth.uid(), p_mode, (select nickname from public.members where user_id = auth.uid()), now())
  on conflict (user_id) do update set notify_mode = excluded.notify_mode, updated_at = now();
  return jsonb_build_object('ok', true);
end $$;

-- 函式權限：只有拿到身分（包括匿名身分）的人能呼叫網頁用的函式；內部小工具誰都不能直接呼叫
revoke execute on function
  chat_private.is_banned(uuid), chat_private.ban_until(uuid), chat_private.is_admin(uuid), chat_private.is_member(uuid),
  chat_private.message_json(public.messages), chat_private.log_system(text, text), chat_private.check_nickname(text),
  public.join_room(text), public.heartbeat(), public.leave_room(),
  public.send_message(text, text, integer, integer, text[]), public.edit_message(uuid, text, text[]),
  public.recall_message(uuid), public.am_i_admin(), public.admin_remove_message(uuid),
  public.admin_kick(uuid, text), public.set_notify_mode(text)
from public, anon, authenticated;

grant execute on function
  public.join_room(text), public.heartbeat(), public.leave_room(),
  public.send_message(text, text, integer, integer, text[]), public.edit_message(uuid, text, text[]),
  public.recall_message(uuid), public.am_i_admin(), public.admin_remove_message(uuid),
  public.admin_kick(uuid, text), public.set_notify_mode(text)
to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime：私人頻道 room:lobby（架構文件 3.2、5.4）
-- 新訊息、修改、收回、刪除由資料庫廣播；使用者只能收，不能自己亂廣播
-- ---------------------------------------------------------------------------
create or replace function chat_private.broadcast_message()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform realtime.send(
    chat_private.message_json(new),
    case when tg_op = 'INSERT' then 'message_inserted' else 'message_updated' end,
    'room:lobby',
    true
  );
  return null;
end $$;
revoke execute on function chat_private.broadcast_message() from public, anon, authenticated;

drop trigger if exists c4_messages_broadcast on public.messages;
create trigger c4_messages_broadcast
after insert or update on public.messages
for each row execute function chat_private.broadcast_message();

-- 誰能加入頻道：有身分、而且沒被封鎖的人可以「收」；有登記代號的人可以出現在線上名單
drop policy if exists "c4 lobby receive" on realtime.messages;
create policy "c4 lobby receive" on realtime.messages
for select to authenticated
using (realtime.topic() = 'room:lobby' and not chat_private.is_banned(auth.uid()));

drop policy if exists "c4 lobby presence" on realtime.messages;
create policy "c4 lobby presence" on realtime.messages
for insert to authenticated
with check (
  realtime.topic() = 'room:lobby'
  and realtime.messages.extension = 'presence'
  and chat_private.is_member(auth.uid())
  and not chat_private.is_banned(auth.uid())
);

-- realtime 的權限檢查會呼叫這兩個函式，要讓它們能被執行
grant execute on function chat_private.is_banned(uuid), chat_private.is_member(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Storage：圖片（架構文件 4.2 第 4 步、9.1）
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-images', 'chat-images', true, 2097152, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- 只能上傳到 chat-images/<自己的ID>/
drop policy if exists "c4 upload own folder" on storage.objects;
create policy "c4 upload own folder" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'chat-images'
  and (storage.foldername(name))[1] = auth.uid()::text
  and not chat_private.is_banned(auth.uid())
);

-- 收回時刪自己的圖片；管理員可以刪任何圖片
drop policy if exists "c4 delete own or admin" on storage.objects;
create policy "c4 delete own or admin" on storage.objects
for delete to authenticated
using (
  bucket_id = 'chat-images'
  and ((storage.foldername(name))[1] = auth.uid()::text or chat_private.is_admin(auth.uid()))
);

-- 刪除前 Storage 要能「看到」那個檔案
drop policy if exists "c4 read own or admin" on storage.objects;
create policy "c4 read own or admin" on storage.objects
for select to authenticated
using (
  bucket_id = 'chat-images'
  and ((storage.foldername(name))[1] = auth.uid()::text or chat_private.is_admin(auth.uid()))
);

grant execute on function chat_private.is_admin(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 排程（架構文件 3.2 Cron、6.3）
-- ---------------------------------------------------------------------------
create extension if not exists pg_cron;

-- 每分鐘：超過 60 秒沒心跳的人，釋放代號並寫「離開了聊天室」
create or replace function chat_private.sweep_members()
returns void language plpgsql security definer set search_path = '' as $$
declare
  gone record;
begin
  for gone in
    delete from public.members where last_seen < now() - interval '60 seconds' returning nickname
  loop
    perform chat_private.log_system('leave', gone.nickname);
  end loop;
end $$;

-- 每天：刪掉 7 天前的訊息、過期的封鎖
-- （7 天前的圖片檔要用 Storage API 刪，之後由 Edge Function cleanup 負責）
create or replace function chat_private.cleanup()
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.messages where created_at < now() - interval '7 days';
  delete from public.bans where until is not null and until < now();
end $$;

revoke execute on function chat_private.sweep_members(), chat_private.cleanup() from public, anon, authenticated;

-- 讀訊息：有身分、而且沒被封鎖的人可以讀（寫入一律走上面的函式）
drop policy if exists "c4 read messages" on public.messages;
create policy "c4 read messages" on public.messages
for select to authenticated
using (not chat_private.is_banned(auth.uid()));

select cron.unschedule(jobid) from cron.job where jobname in ('c4-sweep-members', 'c4-cleanup');
select cron.schedule('c4-sweep-members', '* * * * *', 'select chat_private.sweep_members()');
select cron.schedule('c4-cleanup', '17 19 * * *', 'select chat_private.cleanup()');

-- ---------------------------------------------------------------------------
-- 加管理員（建立 Supabase 帳號之後執行一次，把 Email 換成你的）：
--   insert into public.admins (user_id)
--   select id from auth.users where email = '你的 Email'
--   on conflict do nothing;
-- ---------------------------------------------------------------------------
