alter table public.orders
add column if not exists payment_received numeric(10, 2),
add column if not exists payment_method text,
add column if not exists received_by text,
add column if not exists paid_at timestamptz;

alter table public.orders
drop constraint if exists orders_payment_method_check;

alter table public.orders
add constraint orders_payment_method_check
check (payment_method is null or payment_method in ('CASH', 'ONLINE'));

alter table public.orders
drop constraint if exists orders_received_by_check;

alter table public.orders
add constraint orders_received_by_check
check (received_by is null or received_by in ('NEETA', 'TRUPTI'));
