﻿using Microsoft.AspNetCore.Components;
using Microsoft.AspNetCore.Components.CompilerServices;
using Nextended.Core.Extensions;

namespace MudBlazor.Extensions.Components.ObjectEdit.Options;

public class RenderData<TPropertyType, TFieldType> : RenderData
{
    public Func<TPropertyType, TFieldType> ToFieldTypeConverterFn { get; set; }
    public Func<TFieldType, TPropertyType> ToPropertyTypeConverterFn { get; set; }

    public RenderData(string valueField, Type componentType, IDictionary<string, object> attributes = null)
        : base(componentType, attributes)
    {
        ValueField = valueField;
    }

    public override void UpdateConditionalSettings<TModel>(TModel model)
    {
        base.UpdateConditionalSettings(model);
        // fallback if condition not match model, we try property value instead
        _conditions?.Where(c => c.modelType == typeof(TPropertyType)).Apply(condition => (condition.condition(ValueWrapper.Value) ? condition.trueFn : condition.falseFn)(this));
        _conditions?.Where(c => c.modelType == typeof(TFieldType)).Apply(condition => (condition.condition(ToFieldTypeConverterFn(ValueWrapper.Value)) ? condition.trueFn : condition.falseFn)(this));
    }

    public override IRenderData InitValueBinding(ObjectEditPropertyMeta propertyMeta, Func<Task> valueChanged)
    {
        ToFieldTypeConverterFn ??= v => v == null ? default : v.MapTo<TFieldType>();
        ToPropertyTypeConverterFn ??= v => v == null ? default : v.MapTo<TPropertyType>();

        ValueWrapper = propertyMeta.As<TPropertyType>();
        //   if (ValueWrapper.Value != null)
        Attributes.AddOrUpdate(ValueField, ToFieldTypeConverterFn(ValueWrapper.Value));
        AttachValueChanged(propertyMeta.ReferenceHolder, valueChanged);
        return this;
    }

    public RenderData<TPropertyType, TFieldType> AddAttributesIf(Func<TPropertyType, bool> condition, bool overwriteExisting, params KeyValuePair<string, object>[] attributes)
    {
        AddAttributesIf<TPropertyType>(condition, overwriteExisting, attributes);
        return this;
    }

    public PropertyValueWrapper<TPropertyType> ValueWrapper { get; set; }
    public string ValueField { get; }

    private bool AttachValueChanged(object eventTarget, Func<Task> valueChanged)
    {
        var eventKeyName = $"{ValueField}Changed";
        if (!IsValidParameterAttribute(eventKeyName))
            return false;
        Attributes.AddOrUpdate(eventKeyName, RuntimeHelpers.TypeCheck(
            EventCallback.Factory.Create(
                eventTarget,
                EventCallback.Factory.CreateInferred(
                    eventTarget, async x =>
                    {
                        ValueWrapper.Value = ToPropertyTypeConverterFn(x);
                        if (valueChanged != null)
                            await valueChanged.Invoke();
                    },
                    ToFieldTypeConverterFn(ValueWrapper.Value)
                )
            )
        ));
        return true;
    }
}