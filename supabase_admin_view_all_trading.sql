-- Admin Console — makita ang trading data ng lahat ng user
--
-- ANG PINAKAMAHALAGANG BAGAY TUNGKOL SA FILE NA ITO:
--
-- Ang pagbabawal ay ginagawa NG SERVER, hindi ng app. Walang linya sa
-- dashboard.js ang makakapagbigay sa isang tao ng datos na hindi ibibigay ng
-- Postgres. Kung tatanggalin mo ang isAdminUser() na tsek sa app, ang isang
-- karaniwang user ay makakakita pa rin ng sarili niyang trade lamang — dahil
-- ang RLS ang humahadlang, at ang RLS ay nasa labas ng abot ng browser.
--
-- Kaya rin HINDI dapat ilagay ang service_role key sa app. Ang key na iyon ay
-- lumalampas sa lahat ng RLS, at ang app na ito ay isang static na pahina: ang
-- sinumang magbubukas ng View Source ay makikita ito, at kasama niyon ang
-- bawat trade ng bawat user. Ang anon key lang ang dapat naroon, at ang
-- is_admin() na ang bahala sa iba.
--
-- Ang is_admin() ay nakabuo na sa supabase_user_access.sql at binabasa ang
-- role mula sa user_access — hindi ito listahan ng email na nasa code.
--
-- Ang mga policy para sa iisang command ay pinagsasama ng OR, kaya ang
-- "select own trades" ay nananatiling buo. Walang nawawala sa karaniwang user;
-- may naidadagdag lang sa admin.
--
-- Patakbuhin ito sa Supabase SQL editor.

-- Ang journal mismo — bawat trade, kasama ang paper.
drop policy if exists "admin can view all trades" on trading_journal;
create policy "admin can view all trades"
  on trading_journal for select
  using (is_admin());

-- Ang mga account. Kailangan ito para may kahulugan ang mga bilang: ang isang
-- $2,000 na kita ay ibang kuwento sa isang 5K na account kaysa sa isang 100K,
-- at ang laki ng account ang tanging paraan para malaman iyon.
drop policy if exists "admin can view all accounts" on trading_accounts;
create policy "admin can view all accounts"
  on trading_accounts for select
  using (is_admin());

-- Ang mga setup: ang mga plano, kasama ang hindi kinuha. Dito nakikita kung
-- ang problema ay ang pagpili ng trade o ang pagpindot mismo.
drop policy if exists "admin can view all setups" on position_setups;
create policy "admin can view all setups"
  on position_setups for select
  using (is_admin());

-- TANDAAN: SELECT lamang ang lahat ng nasa itaas.
--
-- Walang admin policy para sa insert, update o delete nang sadya. Ang pagtingin
-- ay isang bagay at ang pagbabago sa journal ng iba ay isa pang bagay — at ang
-- huli ay walang paraan para mapatunayan ng may-ari na hindi ikaw ang nagbago.
-- Kung kailangan mo iyon balang araw, isang hiwalay na file iyon at isang
-- hiwalay na desisyon.

-- Suriin: bilang mo, dapat mo itong makita nang buo. Bilang karaniwang user,
-- dapat ang sarili mo lang.
--   select count(*) from trading_journal;
--   select is_admin();
