﻿using Microsoft.AspNetCore.Components;
using Nextended.Core.Extensions;
using Nextended.Core.Types;
using Microsoft.AspNetCore.Components.Web;
using MudBlazor.Extensions.Helper;
using MudBlazor.Extensions.Options;

namespace MudBlazor.Extensions.Components;

public partial class MudExTreeView<T> where T : IHierarchical<T>
{
    [Parameter] public bool ReverseExpandButton { get; set; }
    [Parameter] public bool Dense { get; set; }
    [Parameter] public HashSet<T> Items { get; set; }
    [Parameter] public Func<T, string> TextFunc { get; set; } = n => n?.ToString();
    [Parameter] public FilterMode FilterMode { get; set; }
    [Parameter] public TreeViewMode ViewMode { get; set; } = TreeViewMode.Horizontal;

    /// <summary>
    /// Full item template if this is set you need to handle the outer items based on ViewMode on your own. 
    /// Also, the expand/collapse buttons, and you need to decide on your own if and how you use the <see cref="ItemContentTemplate"/>
    /// </summary>
    [Parameter] public RenderFragment<TreeViewItemContext<T>> ItemTemplate { get; set; }

    /// <summary>
    /// Item content template for the item itself without the requirement to change outer element like to control the expand button etc.
    /// </summary>
    [Parameter] public RenderFragment<TreeViewItemContext<T>> ItemContentTemplate { get; set; }

    /// <summary>
    /// This function controls how a separator will be detected. Default is if the item ToString() equals '-'
    /// </summary>
    [Parameter] public Func<T, bool> IsSeparatorDetectFunc { get; set; } = n => n?.ToString() == "-";

    /// <summary>
    /// The expand/collapse icon.
    /// </summary>
    [Parameter]
    [Category(CategoryTypes.TreeView.Appearance)]
    public string ExpandedIcon { get; set; } = Icons.Material.Filled.ChevronRight;


    public bool HasFilters => Filters?.Any(s => !string.IsNullOrWhiteSpace(s)) == true || !string.IsNullOrEmpty(Filter);
    private T selectedNode;
    private List<string> _filters;

    [Parameter]
    public string Filter { get; set; }

    [Parameter]
    public List<string> Filters
    {
        get => _filters;
        set
        {
            if (_filters != value)
            {
                _filters = value;
                SetAllExpanded(HasFilters, entry => true);
            }
        }
    }
    private RenderFragment Inherited() => builder => base.BuildRenderTree(builder);
    private HashSet<T> _expanded = new();
    public bool IsExpanded(T node) => _expanded.Contains(node);
    public void ExpandAll() => _expanded = new HashSet<T>(Items.Recursive(n => n.Children ?? Enumerable.Empty<T>()));
    public void CollapseAll() => _expanded.Clear();
    public bool IsSelected(T node) => node?.Equals(selectedNode) == true; // TODO: implement multiselect

    public virtual bool IsSeparator(T node) => IsSeparatorDetectFunc?.Invoke(node) == true;

    private AnimationDirection? _animationDirection;
    private void NodeClick(T node)
    {
        _animationDirection = node == null || selectedNode?.Parent?.Equals(node) == true ? AnimationDirection.In : AnimationDirection.Out;
        selectedNode = node;
        if (selectedNode != null && ViewMode == TreeViewMode.Default)
        {
            SetExpanded(node, !IsExpanded(node));
        }
    }
    private void OnWheel(WheelEventArgs e)
    {
        if (selectedNode == null || selectedNode.Parent == null || !selectedNode.Parent.HasChildren())
            return;
        if (e.DeltaY < 0)
        {
            NodeClick(selectedNode.Parent.Children.ToArray()[SelectedNodeIndexInPath() - 1]);
        }
        else
        {
            NodeClick(selectedNode.Parent.Children.ToArray()[SelectedNodeIndexInPath() + 1]);
        }
    }

    private int SelectedNodeIndexInPath()
    {
        var node = selectedNode.Parent;
        return Math.Max(node.Children.EmptyIfNull().ToArray().IndexOf(node.Children.FirstOrDefault(IsInPath)), 0);
    }

    private string GetNodeClass(T node)
    {
        if (node.ToString() == "MudExCodeView")
        {

        }
        var classes = "horizontal-tree-node";
        if (IsInPath(node) || IsSelected(node))
        {
            classes += " node-selected";
        }
        if (node.HasChildren())
        {
            classes += " node-expandable";
        }
        return classes;
    }

    public double NodeOffset(T node)
    {
        var children = (node.Children ?? Enumerable.Empty<T>()).ToList();
        var indexOf = children.IndexOf(children.FirstOrDefault(IsInPath));
        var indexOfSelected = Math.Max(indexOf, 0);

        return (children.Count - 1) / 2 - indexOfSelected;
    }

    private string GetTransformStyle(T node)
    {
        var nodeOffset = NodeOffset(node);
        return $"transform: translateY({nodeOffset * 100}%)";
    }


    public IEnumerable<T> Path()
    {
        if (selectedNode != null)
        {
            Console.WriteLine(string.Join(" > ", selectedNode.Path().Select(p => p.ToString())));
            return selectedNode.Path();
        }

        return Enumerable.Empty<T>();
    }

    private bool IsInPath(T node)
    {
        var path = Path();
        var result = path?.Contains(node) == true;
        var s = string.Join("/", path.Select(n => n.ToString()));
        Console.WriteLine($"IsInPath: {node} = {result} Path {s}");
        return result;
    }

    private HashSet<T>? FilteredItems()
    {
        if (FilterMode == FilterMode.Flat && HasFilters)
        {
            return Items.Recursive(e => e?.Children ?? Enumerable.Empty<T>()).Where(e =>
                    Filters.EmptyIfNull().Concat(new[] { Filter }).Distinct().Any(filter => MatchesFilter(e, filter)))
                .ToHashSet();
        }
        return Items;
    }

    private bool MatchesFilter(T node, string text)
    {
        return TextFunc(node).Contains(text, StringComparison.InvariantCultureIgnoreCase);
    }


    private (bool Found, string? Term) GetMatchedSearch(T node)
    {
        if (FilterMode == FilterMode.Flat || !HasFilters)
            return (true, string.Empty);

        if ((node?.Children ?? Enumerable.Empty<T>()).Recursive(n => n?.Children ?? Enumerable.Empty<T>()).Any(n => GetMatchedSearch(n).Found))
            return (true, string.Empty);


        var filters = Filters.EmptyIfNull().ToList();
        if (!string.IsNullOrEmpty(Filter))
            filters.Add(Filter);
        foreach (var filter in filters)
        {
            if (MatchesFilter(node, filter))
                return (true, filter); ;
        }

        return (false, string.Empty); ;
    }

    private void SetAllExpanded(bool expand, Func<T, bool> predicate = null)
    {
        //predicate ??= n => ExpandMode == ExpandMode.SingleExpand || n.Parent == null;
        predicate ??= n => n.Parent == null;
        Items?.Recursive(n => n.Children.EmptyIfNull()).Where(predicate).Apply(e => SetExpanded(e, expand));
    }

    public void SetExpanded(T context, bool expanded)
    {
        if (expanded && !IsExpanded(context))
            _expanded.Add(context);
        else if (!expanded && IsExpanded(context))
            _expanded.Remove(context);
    }

    private bool ShouldRenderViewMode(TreeViewMode mode)
    {
        return mode == ViewMode; //ViewMode.HasFlag(mode);
    }

    private string ListItemClassStr()
    {
        return MudExCssBuilder.Default.
            AddClass("mud-ex-simple-flex")
            .AddClass("mud-ex-flex-reverse-end", ReverseExpandButton)
            .ToString();
    }

    private string TreeItemClassStr()
    {
        return MudExCssBuilder.Default
            .AddClass("mud-ex-treeview-item-reverse-space-between", ReverseExpandButton)
            .ToString();
    }

    private string ListBoxStyleStr()
    {
        if (_animationDirection == null)
        {
            Console.WriteLine("AnimationDirection is null");
            return string.Empty;
        }
        var duration = TimeSpan.FromMilliseconds(300);
        Task.Delay(duration).ContinueWith(_ =>
        {
            _animationDirection = null;
            InvokeAsync(StateHasChanged);
        });
        return MudExStyleBuilder.Default.WithAnimation(
            AnimationType.Slide,
            duration,
            _animationDirection,
            AnimationTimingFunction.EaseInOut,
             DialogPosition.CenterRight, when: _animationDirection != null).Style;
    }
}


public enum FilterMode
{
    Default,
    Flat
}


public enum TreeViewMode
{
    Default,
    Horizontal,
    Breadcrumb,
    List
}