# Chart Generation Guide

The ZeroAI Assistant now supports interactive charts using Chart.js!

## How It Works

The assistant can generate charts by including special code blocks in its responses:

```chart
{
  "type": "pie",
  "data": { ... },
  "options": { ... }
}
```

## Supported Chart Types

### 1. Pie Chart (Sector Allocation)
```chart
{
  "type": "pie",
  "data": {
    "labels": ["IT Services", "Banking", "Pharma"],
    "datasets": [{
      "data": [45, 35, 20],
      "backgroundColor": ["#FF6384", "#36A2EB", "#fcdf96ff"]
    }]
  },
  "options": {
    "responsive": true,
    "plugins": {
      "title": {
        "display": true,
        "text": "Portfolio Sector Allocation (%)"
      }
    }
  }
}
```

### 2. Bar Chart (Holdings P&L)
```chart
{
  "type": "bar",
  "data": {
    "labels": ["INFY", "TCS", "HDFCBANK"],
    "datasets": [{
      "label": "Profit/Loss (₹)",
      "data": [2850, -1200, 4560],
      "backgroundColor": ["#4CAF50", "#F44336", "#4CAF50"]
    }]
  },
  "options": {
    "responsive": true,
    "plugins": {
      "title": {
        "display": true,
        "text": "Holdings P&L"
      }
    },
    "scales": {
      "y": {
        "beginAtZero": true
      }
    }
  }
}
```

### 3. Line Chart (Portfolio Performance)
```chart
{
  "type": "line",
  "data": {
    "labels": ["Jan", "Feb", "Mar", "Apr", "May"],
    "datasets": [{
      "label": "Portfolio Value (₹)",
      "data": [100000, 102000, 98000, 105000, 110000],
      "borderColor": "#36A2EB",
      "tension": 0.3
    }]
  },
  "options": {
    "responsive": true,
    "plugins": {
      "title": {
        "display": true,
        "text": "Portfolio Growth Over Time"
      }
    }
  }
}
```

### 4. Doughnut Chart (Asset Allocation)
```chart
{
  "type": "doughnut",
  "data": {
    "labels": ["Equities", "Bonds", "Cash"],
    "datasets": [{
      "data": [70, 20, 10],
      "backgroundColor": ["#FF6384", "#36A2EB", "#FFCE56"]
    }]
  },
  "options": {
    "responsive": true,
    "plugins": {
      "title": {
        "display": true,
        "text": "Asset Class Distribution"
      }
    }
  }
}
```

## Example Prompts That Generate Charts

### Portfolio Analysis
"Analyze my portfolio and show sector allocation as a pie chart"

### Stock Comparison
"Compare the P&L of INFY, TCS, and HDFCBANK with a bar chart"

### Performance Tracking
"Show my portfolio performance over the last 6 months as a line chart"

### Risk Distribution
"Display my risk exposure across different asset classes as a doughnut chart"

## How the LLM Generates Charts

The assistant is instructed to:
1. Perform the analysis or calculation
2. Format the data in Chart.js JSON structure
3. Wrap it in a \`\`\`chart code block
4. The frontend automatically detects and renders it

## Tips for Best Results

1. **Be specific**: "Show sector allocation as a pie chart" works better than "visualize my portfolio"
2. **Provide context**: Mention the stocks or data you want visualized
3. **Request chart type**: Specify pie, bar, line, or doughnut chart
4. **Multiple charts**: You can request multiple charts in one response

## Current Limitations

- Charts are based on mock data (INFY, TCS, HDFCBANK) until real MCP integration
- No interactive drill-down yet
- Limited to Chart.js supported chart types
- Static data (no real-time updates)

## Future Enhancements

- [ ] Real data from Kite Connect API
- [ ] Interactive chart tooltips with more details
- [ ] Export charts as images
- [ ] Historical data overlays
- [ ] Benchmark comparisons
- [ ] Risk heat maps

## Technical Details

**Libraries:**
- Chart.js v4.4.1
- Marked.js v11.1.1 (for markdown)

**Chart Detection:**
The frontend scans assistant responses for \`\`\`chart blocks and parses the JSON using `JSON.parse()`, then renders using `new Chart()`.
