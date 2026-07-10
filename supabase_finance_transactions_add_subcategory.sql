-- Optional finer breakdown under a transaction's Category (e.g. Category
-- "Food & Groceries" -> Subcategory "Restaurant") so spending analytics can
-- go one level deeper than the top-level category alone.

alter table finance_transactions add column if not exists subcategory text;
