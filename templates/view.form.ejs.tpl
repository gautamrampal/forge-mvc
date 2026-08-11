<h4 class="mb-3"><%= title %></h4>
<div class="card"><div class="card-body">
  <form method="POST" action="<%= record.id ? '/__kebab__/' + record.id : '/__kebab__' %>" novalidate>
    <input type="hidden" name="_csrf" value="<%= csrfToken %>">
    <% if (record.id) { %><input type="hidden" name="_method" value="PUT"><% } %>

    <!-- Add your fields here, e.g.: -->
    <!--
    <div class="mb-3">
      <label class="form-label">Name *</label>
      <input type="text" name="name" class="form-control <%= formErrors.name ? 'is-invalid' : '' %>" value="<%= record.name || '' %>" required>
      <% if (formErrors.name) { %><div class="invalid-feedback d-block"><%= formErrors.name %></div><% } %>
    </div>
    -->

    <div class="mt-4 d-flex gap-2">
      <button type="submit" class="btn btn-primary">Save</button>
      <a href="/__kebab__" class="btn btn-outline-secondary">Cancel</a>
    </div>
  </form>
</div></div>
