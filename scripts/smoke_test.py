from runner import run_python

r = run_python('print("Order successful")\nviz.status("success", "Paid")')
assert r["ok"], r
assert "success" in str(r["viz"]).lower()
print("runner ok:", r["viz"])
