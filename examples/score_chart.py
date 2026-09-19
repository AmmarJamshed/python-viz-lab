scores = {"Alice": 8, "Ben": 5, "Cara": 9}
labels = list(scores.keys())
values = list(scores.values())
viz.chart(labels, values)
print("Chart built from the scores dict")
